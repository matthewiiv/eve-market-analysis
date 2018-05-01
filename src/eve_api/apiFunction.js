const request = require('superagent');
const async = require('async');
const redis = require('redis');

const regionIds = require('../data').regionIds;
const typeIds = require('../data').typeIds;

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
    try {
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
      })
    } catch (e) {
      if(arrIndex < arr.length - 1) {
        writeTypeRegionOrdersArrToDb(callback)(regionId, arr, arrIndex + 1)
      } else {
        callback(e)
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
          getAllAPIOrders(regionIds, regionIndex, attempt + 1)
        } else {
          if(regionIndex < regionIds.length) {
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
                    console.log(`region ${regionId} orders write ${res}`, `errors ${err}`)
                    if(regionIndex < regionIds.length) {
                      getAllAPIOrders(regionIds, regionIndex + 1, 1)
                    } else {
                      console.log("finished")
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

// const startTime = Date.now();
//
// let typeBuyOrders = [];
// let typeSellOrders = [];
//

//
// var getOrders = (callback) => {
//   return (typeId, regionId) => {
//     var start = Date.now();
//     apiSends.push(start)
//     let itemRoot = `https://esi.tech.ccp.is/latest/markets/${regionId}/orders/`;
//     var itemParams = {
//       "datasource": "tranquility",
//       "order_type": "all",
//       "page": 1,
//       "type_id": typeId
//     };
//     const itemUrl = constructURL(itemRoot, itemParams);
//     request
//     .get(itemUrl)
//     .then((res) => {
//       console.log(Date.now()-start)
//       callback(null, res.body)
//     })
//     .catch((err) => {
//       callback(err, "error");
//     })
//   }
// }
//
// function getAllAPIOrders(typeId) {
//   // var start = Date.now();
//   async.parallel(
//     [
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000001')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000002')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000003')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000004')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000005')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000006')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000007')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000008')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000009')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000010')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000011')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000012')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000013')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000014')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000015')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000016')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000017')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000018')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000019')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000020')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000021')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000022')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000023')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000025')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000027')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000028')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000029')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000030')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000031')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000032')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000033')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000034')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000035')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000036')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000037')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000038')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000039')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000040')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000041')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000042')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000043')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000044')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000045')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000046')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000047')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000048')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000049')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000050')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000051')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000052')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000053')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000054')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000055')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000056')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000057')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000058')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000059')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000060')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000061')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000062')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000063')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000064')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000065')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000066')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000067')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000068')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'10000069')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000001')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000002')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000003')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000004')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000005')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000006')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000007')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000008')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000009')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000010')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000011')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000012')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000013')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000014')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000015')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000016')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000017')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000018')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000019')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000020')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000021')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000022')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000023')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000024')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000025')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000026')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000027')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000028')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000029')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000030')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000031')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000032')}),
//       async.reflect((callback) => {getOrders(callback)(typeId,'11000033')})
//
//     ],
//     (err, results) => {
//       if(err){
//         // console.log("err", Date.now() - start)
//         // console.log(err.status);
//         // if (typeIds.indexOf(typeId) < typeIds.length - 1) {
//         //   getAllAPIOrders(typeIds[typeIds.indexOf(typeId) + 1]);
//         // } else {
//         //   getAllAPIOrders(0);
//         // }
//       } else {
//         // console.log(Date.now() - start)
//         var successfulOrders = [];
//         for (var i = 0; i < results.length; i++) {
//           if(results[i].value) {
//             successfulOrders.push(results[i].value);
//           }
//         }
//         var orders = [].concat(...successfulOrders);
//         var buyOrders = orders.filter((order) => {
//           return order.is_buy_order;
//         });
//         var sellOrders = orders.filter((order) => {
//           return !order.is_buy_order;
//         });
//         client.hmset(`type:${typeId}`,"buy", JSON.stringify(buyOrders), "sell", JSON.stringify(sellOrders), "lastUpdated", JSON.stringify(Date.now()), (err, response) => {
//           console.log(`write error ` + err, `${typeId} write ` + response, (Date.now() - startTime) * (1 / (typeIds.indexOf(typeId) / typeIds.length)) / 3600000);
//           if (typeIds.indexOf(typeId) < typeIds.length - 1) {
//             getAllAPIOrders(typeIds[typeIds.indexOf(typeId) + 1]);
//           } else {
//             getAllAPIOrders(0);
//           }
//         })
//       }
//     });
//   }

module.exports = getAllAPIOrders;
