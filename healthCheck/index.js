module.exports = function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');

    context.res = {
        status: 200,
        body: "I'm alive!",
        headers: {
            'Content-Type': 'application/json'
        }
        };
        context.done();
}