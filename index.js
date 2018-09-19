// definition library
const aws = require('aws-sdk');
const moment = require('moment');
const tz = require('moment-timezone');
const uuid = require('uuid');

// definition variables
const cloudwatchlogs = new aws.CloudWatchLogs();
const lambda = new aws.Lambda();

exports.handler = async (event) => {
  // definition of logger
  const logger = new Logger();

  // event parameters
  logger.info('Event parameters');
  logger.info(event);
  const bucketName = event.bucketName;
  const logGroupList = event.logGroupList;
  const eventPrefix = event.prefix;

  // check status of export task
  logger.info('Check status of export task');
  if (typeof event.taskId !== 'undefined') {
    const exportTasks = await describeExportTasks(event.taskId).catch(onError);
    const statusCode = exportTasks[0].status.code;
    logger.debug(exportTasks);
    if (statusCode === 'PENDING' || statusCode === 'PENDING_CANCEL' || statusCode === 'RUNNING') {
      logger.info('Export task running');
      // sleep 10 seconds
      await sleep().catch(onError);
      // invoke self function
      logger.info('Invoke self function');
      await invokeAsync(bucketName, logGroupList, event.prefix, event.taskId).catch(onError);

      // end function
      return 'End function';
    }
  }
  logger.info('There is no running export task');

  // set log group name
  logger.info('Set log group name');
  const logGroupName = setLogGroupName(logGroupList);
  logger.debug(logGroupName);

  // set prefix
  logger.info('Set prefix');
  const yesterday = moment().tz('Asia/Tokyo').add(-1, 'days').format('YYYY/MM/DD');
  const prefix = setPrefix(logGroupName, yesterday, eventPrefix);
  logger.debug(prefix);

  // set export period
  logger.info('Set export period');
  const date = moment().format('YYYYMMDD');
  const from = moment(date).add(-1, 'days').valueOf();
  logger.debug(from);
  const to = moment(date).valueOf();
  logger.debug(to);

  // perform
  logger.info('Perform');
  const exportTask = await createExportTask(logGroupName, prefix, bucketName, from, to).catch(onError);
  logger.info(exportTask);

  // check whether the loggroup to be exported remains
  logger.info('Check whether the loggroup to be exported remains');
  const arrayCount = getArrayCount(logGroupList);
  logger.debug(arrayCount);
  if (arrayCount > 0) {
    // invoke self function
    logger.info('Invoke self function');
    await invokeAsync(bucketName, logGroupList, event.prefix, exportTask.taskId).catch(onError);

    // end function
    return 'End function';
  }

  // end function
  logger.info('Completion of log export');
  return 'End function';
};

// check status
function describeExportTasks(taskId) {
  return new Promise((resolve, reject) => {
    const params = {
      taskId: taskId
    };
    cloudwatchlogs.describeExportTasks(params, (error, response) => {
      if (error) {
        reject(error);
      } else {
        resolve(response.exportTasks);
      }
    });
  });
}

// set loggroup name
function setLogGroupName(logGroupList) {
  if (Object.prototype.toString.call(logGroupList) === '[object Array]') {
    return logGroupList.shift();
  } else {
    return logGroupList;
  }
}

// set prefix
function setPrefix(logGroupName, yesterday, eventPrefix) {
  if (eventPrefix === undefined) {
    if (logGroupName.charAt(0) === '/') {
      return (yesterday + '/' + logGroupName.replace(/\//g, '-').slice(1));
    } else {
      return (yesterday + '/' + logGroupName.replace(/\//g, '-'));
    }
  } else if (eventPrefix.charAt(0) === '/') {
    if (logGroupName.charAt(0) === '/') {
      return (eventPrefix.slice(1) + '/' + yesterday + '/' + logGroupName.replace(/\//g, '-').slice(1));
    } else {
      return (eventPrefix.slice(1) + '/' + yesterday + '/' + logGroupName.replace(/\//g, '-'));
    }
  } else {
    if (logGroupName.charAt(0) === '/') {
      return (eventPrefix + '/' + yesterday + '/' + logGroupName.replace(/\//g, '-').slice(1));
    } else {
      return (eventPrefix + '/' + yesterday + '/' + logGroupName.replace(/\//g, '-'));
    }
  }
}

// perform
function createExportTask(logGroupName, prefix, bucketName, from, to) {
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
        resolve(response);
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

// check whether the loggroup to be exported remains
function getArrayCount(logGroupList) {
  let arrayCount = 0;
  if (Object.prototype.toString.call(logGroupList) === '[object Array]') {
    arrayCount = Object.keys(logGroupList).length;
  }
  return arrayCount;
}

// invoe self function
function invokeAsync(bucketName, logGroupList, prefix, taskId) {
  return new Promise((resolve, reject) => {
    const params = {
      FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
      InvokeArgs: JSON.stringify({
        bucketName: bucketName,
        logGroupList: logGroupList,
        prefix: prefix,
        taskId: taskId
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

function onError(error) {
  console.log(error);
  throw error;
}

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL;
  }

  info(message) {
    const format = {
      logLevel: 'INFO',
      message: message
    };
    console.log(JSON.stringify(format));
  }

  debug(message) {
    const format = {
      logLevel: 'DEBUG',
      message: message
    };
    if (this.logLevel == 'DEBUG') {
      console.log(JSON.stringify(format));
    }
  }

  error(message) {
    const format = {
      logLevel: 'ERROR',
      message: message
    };
    console.log(JSON.stringify(format));
  }
}