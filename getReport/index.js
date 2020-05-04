const cosmos = require("@azure/cosmos");

// Database connection //
const endpoint = process.env.COSMOS_API_URL;
const masterKey = process.env.COSMOS_API_KEY;
const { CosmosClient } = cosmos;
const client = new CosmosClient({ endpoint: endpoint, key: masterKey });
const container = client
  .database("verificationDB")
  .container("verification-attempts");

module.exports = function(context, req) {
  const countString = "SELECT VALUE COUNT (1) FROM c WHERE";
  var sinceMidnight = new Date();
  var twoHoursAgo = new Date();
  sinceMidnight.setHours(0, 0, 0, 0);
  twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

  var timePoints = [
    { name: "2hrs", string: `c.datestamp >= "${twoHoursAgo}"` },
    { name: "AllTime", string: `true` },
    { name: "Today", string: `c.datestamp >= "${sinceMidnight}"` }
  ];
  var variables = [
    { name: "total", string: "true" },
    { name: "verified", string: "c.verified = true" },
    { name: "unverified", string: "c.verified = false" }
  ];
  var queries = [];

  timePoints.map(timePoint => {
    variables.map(variable => {
      queries.push({
        name: `${variable.name}${timePoint.name}`,
        string: `${countString} ${variable.string} AND ${timePoint.string}`
      });
    });
  });

  var results = [];

  // Then run container.items.query to extract promises and resolve promises as array of {query.name, datum.resources[0]}
  queries.map(query =>
    results.push(container.items.query(query.string).fetchAll())
  );

  Promise.all(results)
    .then(data => {
      data.map(datum => context.log(datum.resources[0]));
      context.done();
    })
    .catch(err => {
      context.log("error" + err);
      context.done();
    });
};
