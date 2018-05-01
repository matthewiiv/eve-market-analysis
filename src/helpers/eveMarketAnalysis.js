
const request = require('superagent');
const async = require('async');

const data = require('../data');

const regionIds = data.regionIds;
const typeIds = data.typeIds;

var bestItemPrices = [];
var sortedBestPrices = [];

var typeIdArr = [];

var itemFunctions = [
  //function(callback){getItems(1,'785',0)}
]

function getItems(page, typeId, region) {
  console.log(region)
  var regionId = regionIds[region];
  var itemsRoot = `https://esi.tech.ccp.is/latest/markets/${regionId}/orders/`;
  var itemsParams = {
    "datasource": "tranquility",
    "order_type": "all",
    "page": page,
    "type_id": typeId
  }
  const itemsUrl = constructURL(itemsRoot, itemsParams);
  request
   .get(itemsUrl)
   .then(function(res) {
     if (region < regionIds.length - 2) {
       //console.log(res.body);
       //console.log(bestItemPrices);
       checkSystemPrices(res.body, typeId);
       getItems(page, typeId, region + 1)
     } else {
       console.log(bestItemPrices);
       var sortedBestPrices = sortByKey(bestItemPrices.filter(value => Object.keys(value).length !== 0), "profit");
       console.log(sortedBestPrices[0])
     }
   })
   .catch(function(err) {
     if (region < regionIds.length - 2) {
       getItems(page, typeId, region + 1)
     } else {
       console.log(bestItemPrices);
       var sortedBestPrices = sortByKey(bestItemPrices.filter(value => Object.keys(value).length !== 0), "profit");
       console.log(sortedBestPrices[0])
     }
   });
}

function checkSystemPrices(arr, typeId) {
  if(!bestItemPrices[parseInt(typeId)]) {
    bestItemPrices[parseInt(typeId)] = {}
  }
  if(bestItemPrices[parseInt(typeId)].buy && bestItemPrices[parseInt(typeId)].sell) {
      bestItemPrices[parseInt(typeId)].profit = bestItemPrices[parseInt(typeId)].buy.price / bestItemPrices[parseInt(typeId)].sell.price
  }
  var i;
  for (i = 0; i < arr.length; i++) {
    if (arr[i].is_buy_order) {
      checkBuyOrder(arr[i])
    } else {
      checkSellOrder(arr[i])
    };
  }
}

function checkBuyOrder(item) {
  var id = parseInt(item.type_id);
  if(!bestItemPrices[id].buy) {
    bestItemPrices[id].buy = item;
  }
  if (bestItemPrices[id].buy.price < item.price) {
    bestItemPrices[id].buy = item;
  }
}

function checkSellOrder(item) {
  var id = parseInt(item.type_id);
  if(!bestItemPrices[id].sell) {
    bestItemPrices[id].sell = item;
  }
  if (bestItemPrices[id].sell.price > item.price) {
    bestItemPrices[id].sell = item;
  }
}

function constructURL(root, params) {
  return Object.keys(params).reduce((acc, el, index) => {
    return index === 0 ? `${acc}?${el}=${params[el]}` : `${acc}&${el}=${params[el]}`;
  }, root)
}

function sortByKey(array, key) {
  return array.sort(function(a, b) {
    var x = a[key]; var y = b[key];
    return ((x < y) ? 1 : ((x > y) ? -1 : 0));
  });
}

function analyseRoutes() {
  //getItems(1, "657", 0)
  async.parallel(
    itemFunctions,
    //typeIdArr,
    function(err, results){

  });
};



module.exports = analyseRoutes;
