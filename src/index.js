'use strict';
const request = require('superagent');
const async = require('async');
const Hapi = require('hapi');

const testFunction = require('./helpers/eveMarketAnalysis');
const testParallel = require('./eve_api/apiFunction');
const typeIds = require('./data').typeIds;
const regionIds = require('./data').regionIds;

const bankBalance = 1000000;

var redis = require("redis")
var client = redis.createClient();
//testFunction();

testParallel(regionIds, 0, 1);

// if you'd like to select database 3, instead of 0 (default), call
// client.select(3, function() { /* ... */ });

client.on("error", function (err) {
  console.log("Error " + err);
});

//function getRegionOrders
client.hget("region:10000001", "sell", (err,reply) => {
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


        bestBuyItem.profitMargin = profitMargin;
        bestBuyItem.maxRealProfit = maxRealProfit;
        bestBuyItem.purchase_price = bestItemPrices[i].price;
        bestBuyItem.maxTransactionVolume = maxTransactionVolume;
        bestBuyItem.maxTransactionAmount = maxTransactionVolume  * bestBuyItem.purchase_price;
        bestBuyItem.numberToBuy = (j-1);
        bestBuyItem.totalPurchaseValue = (j-1) * purchasePrice;
        bestBuyItem.actualProfit = ((j-1) * purchasePrice * profitMargin) - bestBuyItem.totalPurchaseValue;
        orderedDeals.push(bestBuyItem);
      }
    }
    orderedDeals.sort(function(a, b) {
      return b.actualProfit - a.actualProfit;
    });
    console.log(orderedDeals.slice(0, 4))
  })
})

function getAndCompareOtherRegionBuyPrices(regionIds, regionIndex, typeIds, typeIdIndex, bestBuyPrices, callback) {
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
          if(itemBuyOrders[i].price > bestBuyPrices[itemBuyOrders[i].type_id].price) {
            bestBuyPrices[itemBuyOrders[i].type_id] = itemBuyOrders[i];
          }
        } else {
          bestBuyPrices[itemBuyOrders[i].type_id] = itemBuyOrders[i];
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

server.route({
  method: 'GET',
  path: '/{name}',
  handler: (request, h) => {
    request.logger.info('In handler %s', request.path);
    return `Hello, ${encodeURIComponent(request.params.name)}!`;
  }
});

const init = async () => {

  await server.register(require('inert'));

  server.route({
    method: 'GET',
    path: '/',
    handler: (request, h) => {
      return h.file('./public/index.html');
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
