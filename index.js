'use strict';

//definition library
const aws = require('aws-sdk');
const co = require('co');
const moment = require('moment');
const tz = require('moment-timezone');
const uuid = require('uuid');

//difinition variables
const cloudwatchlogs = new aws.CloudWatchLogs();
const lambda = new aws.Lambda();
const STATUS_COMPLETED = 'COMPLETED';
const STATUS_RUNNING = 'RUNNING';

exports.handler = (event, context, callback) => {
  console.log('start function');

  // event params
  console.log(JSON.stringify(event));

  // s3 bucket name
  const bucketName = event.bucketName;

  // export loggroup list
  const logGroupList = event.logGroupList;

  // export period
  const date = moment().format('YYYYMMDD');
  const from = moment(date).add(-1, 'days').valueOf();
  const to = moment(date).valueOf();
  const yesterday = moment().tz('Asia/Tokyo').add(-1, 'days').format('YYYY/MM/DD');

  co(function* () {
    // check status
    console.log('check status');
    if ((yield describeExportTasks(STATUS_RUNNING)).length !== 0) {
      console.log(STATUS_RUNNING);

      // sleep 10 seconds
      yield sleep();
    }
    console.log('progressing task none');

    // export loggroup name
    const logGroupName = getLogGroupName();

    // export prefix
    const prefix = setPrefix(logGroupName);

    // perform
    console.log('start export');
    const taskId = yield createExportTask(logGroupName, prefix);

    // check status
    console.log('check status');
    while ((yield describeExportTasks(STATUS_COMPLETED, taskId)).length === 0) {
      console.log(STATUS_RUNNING);

      // sleep 10 seconds
      yield sleep();
    }
    console.log(STATUS_COMPLETED);
    console.log('finish export');

    // check loggroup list
    console.log('check loggroup list');
    const arrayCount = getArrayCount();
    if (arrayCount > 0) {
      console.log('invoke self function');
      yield invokeAsync();
    }
    return null;
  }).then(onEnd).catch(onError);

  // check export status
  function describeExportTasks(status, taskId) {
    return new Promise((resolve, reject) => {
      const params = {
        statusCode: status
      };
      if (taskId) {
        params.taskId = taskId;
      }
      cloudwatchlogs.describeExportTasks(params, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response.exportTasks);
        }
      });
    });
  }

  // get loggroup name
  function getLogGroupName() {
    if (Object.prototype.toString.call(logGroupList) === '[object Array]') {
      return logGroupList.shift();
    } else {
      return logGroupList;
    }
  }

  // set prefix
  function setPrefix(logGroupName) {
    const prefix = event.prefix;
    if (prefix === undefined) {
      if (logGroupName.charAt(0) === '/') {
        return (yesterday + '/' + logGroupName.replace(/\//g, '-').slice(1));
      } else {
        return (yesterday + '/' + logGroupName.replace(/\//g, '-'));
      }
    } else if (prefix.charAt(0) === '/') {
      if (logGroupName.charAt(0) === '/') {
        return (prefix.slice(1) + '/' + yesterday + '/' + logGroupName.replace(/\//g, '-').slice(1));
      } else {
        return (prefix.slice(1) + '/' + yesterday + '/' + logGroupName.replace(/\//g, '-'));
      }
    } else {
      if (logGroupName.charAt(0) === '/') {
        return (prefix + '/' + yesterday + '/' + logGroupName.replace(/\//g, '-').slice(1));
      } else {
        return (prefix + '/' + yesterday + '/' + logGroupName.replace(/\//g, '-'));
      }
    }
  }

  // perform export
  function createExportTask(logGroupName, prefix) {
    return new Promise((resolve, reject) => {
      const params = {
        destination: bucketName,
        from: from,
        logGroupName: logGroupName,
        to: to,
        destinationPrefix: prefix,
        taskName: uuid.v4()
      };
      cloudwatchlogs.createExportTask(params, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response.taskId);
        }
      });
    });
  }

  // sleep 10 seconds
  function sleep() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(null);
      }, 10000);
    });
  }

  // loggroup list count
  function getArrayCount() {
    let arrayCount = 0;
    if (Object.prototype.toString.call(logGroupList) === '[object Array]') {
      arrayCount = Object.keys(logGroupList).length;
    }
    console.log(arrayCount);
    return arrayCount;
  }

  // invoe self function
  function invokeAsync() {
    return new Promise((resolve, reject) => {
      const params = {
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        InvokeArgs: JSON.stringify({
          bucketName: bucketName,
          logGroupList: logGroupList,
          prefix: event.prefix
        })
      };
      lambda.invokeAsync(params, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(null);
        }
      });
    });
  }

  // end
  function onEnd() {
    console.log('finish function');
    callback(null, 'succeed');
  }

  // error
  function onError(error) {
    console.log(error, error.stack);
    callback(error, error.stack);
  }
};