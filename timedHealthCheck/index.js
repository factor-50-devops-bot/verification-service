module.exports = function (context, myTimer) {
    var timeStamp = new Date().toLocaleString();

    context.log('Health check CRON trigger executed at : ', timeStamp);   

    context.done();
};