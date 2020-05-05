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
    { name: "last2Hours", string: `c.datestamp >= "${twoHoursAgo}"` },
    { name: "today", string: `c.datestamp >= "${sinceMidnight}"` },
    { name: "sinceLaunch", string: `true` },
    
  ];
  var variables = [
    { name: "total", string: "true" },
    { name: "verified", string: "c.verified = true" },
    { name: "unverified", string: "c.verified = false" },
    { name: "error", string: "c.isError = true" }
  ];

  var metrics = variables.map(variable => {
    return {
      section: variable.name,
      queries: timePoints.map(timePoint => {
        return {
          name: `${timePoint.name}`,
          string: `${countString} ${variable.string} AND ${timePoint.string}`
        };
      })
    };
  });

  var results = metrics.map(metric => {
    return new Promise((resolve, reject) => {
      Promise.all(
        metric.queries.map(query => {
          return new Promise((resolve, reject) => {
            container.items
              .query(query.string)
              .fetchAll()
              .then(queryResult =>
                resolve({ name: query.name, result: queryResult.resources[0] })
              )
              .catch(err => reject(err));
          });
        })
      )
        .then(sectionResult =>
          resolve({ section: metric.section, results: sectionResult })
        )
        .catch(err => reject(err));
    });
  });

  Promise.all(results)
    .then(data => {
    var reportLines = data.map(datum => {var reportObject = {section: datum.section};
    datum.results.forEach(result => reportObject[result.name] = result.result);
    return reportObject;}
    )
      context.res = {
        status: 200,
        body: reportLines,
        headers: { 
          "Content-Type": "application/json"
        }
      };
      context.done();
    })
    .catch(err => {
      context.log("error" + err);
      context.done();
    });
};
