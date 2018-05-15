'use strict';
const request = require('superagent');
const async = require('async');
const Hapi = require('hapi');

const testFunction = require('./helpers/eveMarketAnalysis');
const testParallel = require('./eve_api/apiFunction');
const typeIds = require('./data').typeIds;
const regionIds = require('./data').regionIds;
const nullSecs = require('./data').nullSecs;

const badItems = [17366, 17368, 672, 11134, 11132];

var redis = require("redis")
var client = redis.createClient();
//testFunction();

let bestHaul = [];
let fundsToInvest = 7900000;

testParallel(regionIds, 0, 1);

//getBestHaul(regionIds, 0);

function getBestHaul(regionIds, regionIndex) {
  getBestPricesFromRegion(regionIds[regionIndex], fundsToInvest).then((response) => {
    console.log(regionIndex / regionIds.length)
    //console.log(bestHaul)
    if (JSON.parse(response)[0] !== undefined) {
      bestHaul.push(JSON.parse(response)[0])
      // if (bestHaul == null) {
      //   bestHaul = JSON.parse(response)[0]
      // }
      // if (JSON.parse(response)[0].actualProfit > bestHaul.actualProfit) {
      //   bestHaul = JSON.parse(response)[0]
      // }
      if (regionIndex < regionIds.length - 1) {
        getBestHaul(regionIds, regionIndex + 1)
      } else {
        bestHaul.sort(function(a, b) {
          return b.actualProfit - a.actualProfit;
        });
        console.log(bestHaul.slice(0, 4))
        //setTimeout(function(){ getBestHaul(regionIds, 0) }, 60000);
      }
    } else {
      if (regionIndex < regionIds.length - 1) {
        getBestHaul(regionIds, regionIndex + 1)
      } else {
        bestHaul.sort(function(a, b) {
          return b.actualProfit - a.actualProfit;
        });
        console.log(bestHaul.slice(0, 4))
        //setTimeout(function(){ getBestHaul(regionIds, 0) }, 60000);
      }
    }
  });
}

// Add ability to include nearby regions in search
// Add ability to set cargo hold size
// Add abililty to show overall best haul not just current region

client.on("error", function (err) {
  console.log("Error " + err);
});

//function getRegionOrders
function getBestPricesFromRegion(locationId, bankBalance) {

  return new Promise((resolve) => {
    client.hget(`region:${locationId}`, "sell", (err,reply) => {
      if (err) {
        console.log(err);
      }
      let bestItemPrices = [];
      let items = JSON.parse(reply);
      for (var i = 0, len = items.length; i < len; i++) {
        if (bestItemPrices[items[i].type_id] !== undefined) {
          if(items[i].price < bestItemPrices[items[i].type_id].price) {
            bestItemPrices[items[i].type_id] = items[i];
          }
        } else {
          bestItemPrices[items[i].type_id] = items[i];
        }
      }
      bestItemPrices = bestItemPrices.filter(n => true)
      let typeIds = bestItemPrices;
      let bestBuyPrices = [];
      getAndCompareOtherRegionBuyPrices(regionIds, 0, typeIds, 0, bestBuyPrices, (bestBuyPrices) => {
        // Decide what to do with bestBuyPrices array and best Item Prices to get best hauling routes
        let orderedDeals = [];
        for (var i = 0, len = bestItemPrices.length; i < len; i++) {
          let bestBuyItem = bestBuyPrices[bestItemPrices[i].type_id]
          if (bestBuyItem !== undefined) {
            let maxTransactionVolume = Math.min(bestBuyItem.volume_remain, bestItemPrices[i].volume_remain)
            let maxRealProfit = (bestBuyItem.price - bestItemPrices[i].price) * maxTransactionVolume
            let profitMargin = bestBuyItem.price / bestItemPrices[i].price;
            let purchasePrice = bestItemPrices[i].price;

            let totalPurchasePrice = purchasePrice;
            let j = 1;

            while(totalPurchasePrice < bankBalance && j <= maxTransactionVolume) {
              j++;
              totalPurchasePrice = j * purchasePrice;
            }

            bestBuyItem.purchaseSystem = bestItemPrices[i].system_id;
            bestBuyItem.profitMargin = profitMargin;
            bestBuyItem.maxRealProfit = maxRealProfit;
            bestBuyItem.purchase_price = bestItemPrices[i].price;
            bestBuyItem.maxTransactionVolume = maxTransactionVolume;
            bestBuyItem.maxTransactionAmount = maxTransactionVolume  * bestBuyItem.purchase_price;
            bestBuyItem.numberToBuy = (j-1);
            bestBuyItem.totalPurchaseValue = (j-1) * purchasePrice;
            bestBuyItem.actualProfit = ((j-1) * purchasePrice * profitMargin) - bestBuyItem.totalPurchaseValue;
            bestBuyItem.age = (Date.now() - bestBuyItem.lastUpdated) / 60000;
            if (nullSecs.indexOf(bestBuyItem.purchaseSystem) < 0 && badItems.indexOf(bestBuyItem.type_id) < 0 && bestBuyItem.age < 60) {
              orderedDeals.push(bestBuyItem);
            }
          }
        }
        orderedDeals.sort(function(a, b) {
          return b.actualProfit - a.actualProfit;
        });
        //console.log(orderedDeals.slice(0, 4))
        resolve(JSON.stringify(orderedDeals.slice(0, 8)))
      });
    });
  });
}

function getAndCompareOtherRegionBuyPrices(regionIds, regionIndex, typeIds, typeIdIndex, bestBuyPrices, callback) {
  if (typeIds[typeIdIndex] !== undefined) {
    let typeId = typeIds[typeIdIndex].type_id;
    client.hget(`type:${typeId}:region:${regionIds[regionIndex]}`, "buy", (err, reply) => {
      if (err || reply == null) {
        if (regionIndex < regionIds.length - 1) {
          getAndCompareOtherRegionBuyPrices(regionIds, regionIndex + 1, typeIds, typeIdIndex, bestBuyPrices, callback)
        } else {
          if (typeIdIndex < typeIds.length - 1) {
            getAndCompareOtherRegionBuyPrices(regionIds, 0, typeIds, typeIdIndex + 1, bestBuyPrices, callback)
          } else {
            callback(bestBuyPrices)
          }
        }
      } else {
        let itemBuyOrders = JSON.parse(reply);
        for (var i = 0, len = itemBuyOrders.length; i < len; i++) {
          if (bestBuyPrices[itemBuyOrders[i].type_id] !== undefined) {
            if(itemBuyOrders[i].price > bestBuyPrices[itemBuyOrders[i].type_id].price && nullSecs.indexOf(itemBuyOrders[i].system_id) < 0) {
              bestBuyPrices[itemBuyOrders[i].type_id] = itemBuyOrders[i];
            }
          } else {
            if(nullSecs.indexOf(itemBuyOrders[i].system_id) < 0) {
              bestBuyPrices[itemBuyOrders[i].type_id] = itemBuyOrders[i];
            }
          }
        }
        if (regionIndex < regionIds.length - 1) {
          getAndCompareOtherRegionBuyPrices(regionIds, regionIndex + 1, typeIds, typeIdIndex, bestBuyPrices, callback)
        } else {
          if (typeIdIndex < typeIds.length - 1) {
            getAndCompareOtherRegionBuyPrices(regionIds, 0, typeIds, typeIdIndex + 1, bestBuyPrices, callback)
          } else {
            callback(bestBuyPrices)
          }
        }
      }
    });
  } else {
    if (regionIndex < regionIds.length - 1) {
      getAndCompareOtherRegionBuyPrices(regionIds, regionIndex + 1, typeIds, typeIdIndex, bestBuyPrices, callback)
    } else {
      if (typeIdIndex < typeIds.length - 1) {
        getAndCompareOtherRegionBuyPrices(regionIds, 0, typeIds, typeIdIndex + 1, bestBuyPrices, callback)
      } else {
        callback(bestBuyPrices)
      }
    }
  }
}

// client.hmset("user:1000", "username", "antirez", "birthyear", "1977", "verified", "1", function (err, replies) {
//     console.log(err, replies);
//     client.hgetall("user:1000", (err, replies) => {
//       console.log(replies.username);
//       client.quit();
//     })
// });

const server = Hapi.server({
  port: 3000,
  host: 'localhost'
});

const init = async () => {

  await server.register(require('inert'));

  server.route({
    method: 'GET',
    path: '/',
    handler: (request, h) => {
      //return h.file('./public/index.html');
      return "Hello"
    }
  });

  server.route({
    method: 'GET',
    path: '/haul',
    handler: async function (request, reply) {
      var params = request.query;
      fundsToInvest = params.balance;
      bestHaul = [];
      if (params.bestHaul == 1){
        getBestHaul(regionIds, 0);
      }
      console.log(params)
      try {
        let data = await getBestPricesFromRegion(params.region, params.balance);
        return data;
      } catch (error) {
        reply(error);
      }
    }
  });

  await server.start();
  console.log(`Server running at: ${server.info.uri}`);
};

process.on('unhandledRejection', (err) => {
  console.log(err);
  process.exit(1);
});

init();
