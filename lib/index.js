'use strict'

module.exports = (function () {
  const FiveBeansClient = require('fivebeans').client
  const winston = require('winston')

  const ReconnectTimeout = 10000
  const MaxReconnectAttempts = 3

  // This is the global connected client variable. This will be
  // set to the five-beans client when connected. If not connected,
  // it will be set to null.
  var connectedClients = {
  }

  const connectionName = (cName) => cName || 'default'

  const connect = function (whichConnection, host, port, handleReconnect, reconnectCount = 0) {
    let client = new FiveBeansClient(host, port)

    let connection = connectionName(whichConnection)

    return new Promise((resolve, reject) => {
      let reconnecting = false
      client
        .on('connect', () => {
          connectedClients[connection] = client
          resolve(client)
        })

        .on('error', (err) => {
          if (handleReconnect) {
            if (reconnectCount < MaxReconnectAttempts) {
              reconnecting = true
              winston.log('info', 'Reconnect attempt %d', reconnectCount)
              setTimeout(handleReconnect, ReconnectTimeout, reconnectCount + 1)
              resolve(null)
            } else {
              reject(err)
            }
          } else {
            reject(err)
          }
        })

        .on('close', () => {
          winston.log('info', 'Got a "close" event')
          if (handleReconnect) {
            if (!reconnecting) setTimeout(handleReconnect, ReconnectTimeout, 1)
            resolve(null)
          } else {
            connectedClients[connection] = null
            resolve(null)
          }
        })

        .connect()
    })
  }

  const hasConnection = (whichConnection) => {
    return !!connectedClients[whichConnection]
  }

  const useTube = (whichConnection, tubeName) => {
    let connection = connectionName(whichConnection)

    return new Promise((resolve, reject) => {
      connectedClients[connection].use(tubeName, (err) => {
        if (err) return reject(err)
        resolve(tubeName)
      })
    })
  }

  const putJob = (whichConnection, priority, delay, ttr, payload) => {
    let connection = connectionName(whichConnection)

    winston.log('debug', `Priority: ${priority}`)
    winston.log('debug', `Delay: ${delay}`)
    winston.log('debug', `Ttr: ${ttr}`)
    winston.log('debug', `Payload: '${payload}'`)

    return new Promise((resolve, reject) => {
      connectedClients[connection].put(priority, delay, ttr, payload, (err, jobid) => {
        if (err) return reject(err)
        resolve(jobid)
      })
    })
  }

  const queueJob = (whichConnection, tubeName, priority, delay, ttr, data) => {
    let connection = connectionName(whichConnection)

    return useTube(connection, tubeName)
      .then((tn) => putJob(connection, priority, delay, ttr, data))
  }

  const listTubes = (whichConnection) => {
    let connection = connectionName(whichConnection)

    return new Promise((resolve, reject) => {
      connectedClients[connection].list_tubes((err, tubeNames) => {
        if (err) return reject(err)
        resolve(tubeNames)
      })
    })
  }

  const getTubeStatistics = (whichConnection, tubeName) => {
    let connection = connectionName(whichConnection)

    return new Promise((resolve, reject) => {
      connectedClients[connection].stats_tube(tubeName, (err, tubeStats) => {
        if (err) return reject(err)
        resolve(tubeStats)
      })
    })
  }

  const watchTube = (whichConnection, tubeName) => {
    let connection = connectionName(whichConnection)

    return new Promise((resolve, reject) => {
      connectedClients[connection].watch(tubeName, (err, numWatched) => {
        if (err) return reject(err)
        resolve(numWatched)
      })
    })
  }

  const reserveJob = (whichConnection) => {
    let connection = connectionName(whichConnection)

    return new Promise((resolve, reject) => {
      connectedClients[connection].reserve((err, jobid, payload) => {
        if (err) return reject(err)
        resolve({ id: jobid, payload: payload.toString() })
      })
    })
  }

  const deleteJob = (whichConnection, jobid) => {
    let connection = connectionName(whichConnection)

    return new Promise((resolve, reject) => {
      connectedClients[connection].destroy(jobid, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  const processJobsInTube = (whichConnection, tubeName, workJob) => {
    let connection = connectionName(whichConnection)

    return watchTube(connection, tubeName)
      .then((numWatched) => reserveJob(connection))
      .then((job) => workJob(job)
           .then(() => deleteJob(connection, job.id))
           .catch((err) => {
             deleteJob(connection, job.id)
              .then(() => winston.log('error', err.stack))
           })
      )
      .then(() => {
        // Do it again...
        process.nextTick(() => processJobsInTube(connection, tubeName, workJob))
      })
      .catch((err) => {
        winston.log('error', err.stack)
        process.nextTick(() => processJobsInTube(connection, tubeName, workJob))
      })
  }

  const processRobotJobsInTube = (whichConnection, tubeName, workObj) => {
    winston.log('debug', 'Processing jobs in queue: %s on connection: %s', tubeName, whichConnection)
    let connection = connectionName(whichConnection)

    return watchTube(connection, tubeName)
      .then((numWatched) => reserveJob(connection))
      .then((job) => {
        winston.log('debug', 'Job %d reserved from tube %s', job.id, tubeName)
        return workObj.process(job)
          .then(() => {
            winston.log('debug', 'Job %d processed, deleting', job.id)
            return deleteJob(connection, job.id)
          })
          .catch((err) => {
            winston.log('debug', 'Error processing job %d: %j', job.id, err)
            return deleteJob(connection, job.id)
              .then(() => {
                throw err
              })
          })
      })
      .then(() => {
        // Do it again...
        process.nextTick(() => processRobotJobsInTube(connection, tubeName, workObj))
      })
      .catch((err) => {
        winston.log('error', (err.stack) ? err.stack : err)
        process.nextTick(() => processRobotJobsInTube(connection, tubeName, workObj))
      })
  }

  const mod = {
    connect: connect,
    listTubes: listTubes,
    getTubeStatistics: getTubeStatistics,
    useTube: useTube,
    putJob: putJob,
    queueJob: queueJob,
    watchTube: watchTube,
    deleteJob: deleteJob,
    processJobsInTube: processJobsInTube,
    processRobotJobsInTube: processRobotJobsInTube,
    reserveJob: reserveJob,
    hasConnection: hasConnection
  }

  return mod
}())
