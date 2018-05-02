const request = require('superagent');
const async = require('async');
const redis = require('redis');

const regionIds = require('../data').regionIds;
const typeIds = require('../data').typeIds;

let regionStatus = [];
var client = redis.createClient();

function constructURL(root, params) {
  return Object.keys(params).reduce((acc, el, index) => {
    return index === 0 ? `${acc}?${el}=${params[el]}` : `${acc}&${el}=${params[el]}`;
  }, root)
};

var uniqueArray = (arrArg) => {
  return arrArg.filter((elem, pos, arr) => {
    return arr.indexOf(elem) == pos;
  });
};

var getRegionOrders = (callback) => {
  return (regionId, page) => {
    let itemRoot = `https://esi.tech.ccp.is/latest/markets/${regionId}/types/`;
    var itemParams = {
      "datasource": "tranquility",
      "order_type": "all",
      "page": page,
    };
    const itemUrl = constructURL(itemRoot, itemParams);
    request
    .get(itemUrl)
    .then((res) => {
      callback(null, res)
    })
    .catch((err) => {
      callback(err, "error");
    })
  }
}

var getTypeOrdersByRegion = (callback) => {
  return (regionId, typeId) => {
    let itemRoot = `https://esi.tech.ccp.is/latest/markets/${regionId}/orders/`;
    var itemParams = {
      "datasource": "tranquility",
      "order_type": "all",
      "page": '1',
      "type_id": typeId
    };
    const itemUrl = constructURL(itemRoot, itemParams);
    request
    .get(itemUrl)
    .then((res) => {
      callback(null, res)
    })
    .catch((err) => {
      callback(err, "error");
    })
  }
}

var writeTypeRegionOrdersArrToDb = (callback) => {
  return (regionId, arr, arrIndex) => {
    if (arr[arrIndex] !== undefined && arr[arrIndex][0] !== undefined) {
      let typeId = arr[arrIndex][0].type_id;
      let orders = arr[arrIndex];
      var buyOrders = orders.filter((order) => {
        return order.is_buy_order;
      });
      var sellOrders = orders.filter((order) => {
        return !order.is_buy_order;
      });
      client.hmset(`type:${typeId}:region:${regionId}`, "buy", JSON.stringify(buyOrders), "sell", JSON.stringify(sellOrders), (err, res) => {
        if(arrIndex < arr.length - 1) {
          writeTypeRegionOrdersArrToDb(callback)(regionId, arr, arrIndex + 1)
        } else {
          callback(err, res)
        }
      });
    } else {
      if(arrIndex < arr.length - 1) {
        writeTypeRegionOrdersArrToDb(callback)(regionId, arr, arrIndex + 1)
      } else {
        if (arr[arrIndex] == undefined) {
          callback(`items ${arr}`, 'failed')
        } else if (arr[arrIndex][0] == undefined) {
          callback(`item index ${arrIndex} ${arr[arrIndex]}`, 'failed')
        }
      }
    }
  }
}

function getAllAPIOrders(regionIds, regionIndex, attempt) {
  let regionId = JSON.stringify(regionIds[regionIndex]);
  async.parallel(
    [async.reflect((callback) => {getRegionOrders(callback)(regionId,1)})],
    (err, results) => {
      if(results[0].error !== undefined) {
        console.log(`region ${regionId} fucked up`)
        if (attempt < 6) {
          console.log(`retrying..`)
          setTimeout(function(){
            getAllAPIOrders(regionIds, regionIndex, attempt + 1)
          }, 2000);
        } else {
          if(regionIndex < regionIds.length - 1) {
            getAllAPIOrders(regionIds, regionIndex + 1, 1)
          } else {
            console.log("finished")
          }
        }
      } else {
        //console.log(results)
        let numberOfPages = results[0].value.headers['x-pages'];
        let itemsArr = results[0].value.body;
        let itemPagesArr = [];
        for (var i = 2; i < numberOfPages + 1; i++) {
          itemPagesArr.push(async.reflect((callback) => {getRegionOrders(callback)(regionId,2)}))
        }
        async.parallel(
          itemPagesArr,
          (err, resultsNestOne) => {
            let itemsWithOrders = [];
            for (var i = 0; i < resultsNestOne.length; i++) {
              if(resultsNestOne[i].value !== undefined) {
                itemsWithOrders.push(resultsNestOne[i].value.body);
              }
            }
            let flatItemsWithOrders = [].concat(...itemsWithOrders);
            let uniqueItems = uniqueArray(flatItemsWithOrders);
            let numberOfUniqueItems = uniqueItems.length;
            let itemsInRegionArr = [];
            for (var i = 0; i < numberOfUniqueItems; i++) {
              let type = JSON.stringify(uniqueItems[i]);
              itemsInRegionArr.push(async.reflect((callback) => {getTypeOrdersByRegion(callback)(regionId,type)}))
            }
            async.parallel(
              itemsInRegionArr,
              (err, resultsNestTwo) => {
                let itemsOrders = [];
                for (var i = 0; i < resultsNestTwo.length; i++) {
                  if(resultsNestTwo[i].value) {
                    itemsOrders.push(resultsNestTwo[i].value.body);
                  } else if (resultsNestTwo[i].error) {
                    //console.log("item errored", resultsNestTwo[i].error)
                  }
                }
                let itemsOrdersFlat = [].concat(...itemsOrders);
                var buyOrders = itemsOrdersFlat.filter((order) => {
                  return order.is_buy_order;
                });
                var sellOrders = itemsOrdersFlat.filter((order) => {
                  return !order.is_buy_order;
                });
                client.hmset(`region:${regionId}`,"buy", JSON.stringify(buyOrders), "sell", JSON.stringify(sellOrders), "lastUpdated", JSON.stringify(Date.now()), (err, response) => {
                  if(err) {
                    console.log(`write error ${err}`)
                  }
                  console.log(`region ${regionId} write successful`);
                  writeTypeRegionOrdersArrToDb((err, res) => {
                    console.log(`region ${regionId} orders write ${res}`, `errors ${err}`);
                    if(regionIndex < regionIds.length - 1) {
                      getAllAPIOrders(regionIds, regionIndex + 1, 1)
                    } else {
                      console.log("done")
                      getAllAPIOrders(regionIds, 0, 1)
                    }
                  })(regionId, itemsOrders, 0);
                });
              }
            );
          }
        );
      }
    }
  );
}

module.exports = getAllAPIOrders;
