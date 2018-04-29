
const request = require('superagent');

function analyseRoutes() {
  getItems(1);
};

function getItems(page) {
  const itemsRoot = 'https://esi.tech.ccp.is/latest/markets/10000003/orders/';
  const itemsParams = {
    "datasource": "tranquility",
    "order_type": "all",
    "page": page,
    "type_id": "28668"
  }
  const itemsUrl = constructURL(itemsRoot, itemsParams);
  request
   .get(itemsUrl)
   .then(function(res) {
     if(res.body.length > 0) {
       console.log(res.body.length);
       getItems(page + 1);
     }
   });
}

function constructURL(root, params) {
  return Object.keys(params).reduce((acc, el, index) => {
    return index === 0 ? `${acc}?${el}=${params[el]}` : `${acc}&${el}=${params[el]}`;
  }, root)
}

module.exports = analyseRoutes;
