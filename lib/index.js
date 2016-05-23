module.exports = (function () {
  const FiveBeansClient = require('fivebeans').client

  // This is the global connected client variable. This will be
  // set to the five-beans client when connected. If not connected,
  // it will be set to null.
  // var connectedClient = null
  var connectedClients = {
  }

  var connectionName = (cName) => cName || 'default'

  const connect = (whichConnection, host, port) => {
    var client = new FiveBeansClient(host, port)

    var connection = connectionName(whichConnection)

    return new Promise((resolve, reject) => {
      client
        .on('connect', () => {
          connectedClients[connection] = client
          resolve(client)
        })

        .on('error', (err) => reject(err))

        .on('close', () => {
          connectedClients[connection] = null
          resolve(null)
        })

        .connect()
    })
  }

  const hasConnection = (whichConnection) => {
    return !!connectedClients[whichConnection]
  }

  const useTube = (whichConnection, tubeName) => {
    var connection = connectionName(whichConnection)

    return new Promise((resolve, reject) => {
      connectedClients[connection].use(tubeName, (err) => {
        if (err) return reject(err)
        resolve(tubeName)
      })
    })
  }

  const putJob = (whichConnection, priority, delay, ttr, payload) => {
    var connection = connectionName(whichConnection)

    if (process.env.NODE_ENV === 'development') {
      console.log(`Priority: ${priority}`)
      console.log(`Delay: ${delay}`)
      console.log(`Ttr: ${ttr}`)
      console.log(`Payload: '${payload}'`)
    }
    return new Promise((resolve, reject) => {
      connectedClients[connection].put(priority, delay, ttr, payload, (err, jobid) => {
        if (err) return reject(err)
        resolve(jobid)
      })
    })
  }

  const queueJob = (whichConnection, tubeName, priority, delay, ttr, data) => {
    var connection = connectionName(whichConnection)

    return useTube(connection, tubeName)
      .then((tn) => putJob(connection, priority, delay, ttr, data))
  }

  const listTubes = (whichConnection) => {
    var connection = connectionName(whichConnection)

    return new Promise((resolve, reject) => {
      connectedClients[connection].list_tubes((err, tubeNames) => {
        if (err) return reject(err)
        resolve(tubeNames)
      })
    })
  }

  const getTubeStatistics = (whichConnection, tubeName) => {
    var connection = connectionName(whichConnection)

    return new Promise((resolve, reject) => {
      connectedClients[connection].stats_tube(tubeName, (err, tubeStats) => {
        if (err) return reject(err)
        resolve(tubeStats)
      })
    })
  }

  const watchTube = (whichConnection, tubeName) => {
    var connection = connectionName(whichConnection)

    return new Promise((resolve, reject) => {
      connectedClients[connection].watch(tubeName, (err, numWatched) => {
        if (err) return reject(err)
        resolve(numWatched)
      })
    })
  }

  const reserveJob = (whichConnection) => {
    var connection = connectionName(whichConnection)

    return new Promise((resolve, reject) => {
      connectedClients[connection].reserve((err, jobid, payload) => {
        if (err) return reject(err)
        resolve({ id: jobid, payload: payload.toString() })
      })
    })
  }

  const deleteJob = (whichConnection, jobid) => {
    var connection = connectionName(whichConnection)

    return new Promise((resolve, reject) => {
      connectedClients[connection].destroy(jobid, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  const processJobsInTube = (whichConnection, tubeName, workJob) => {
    var connection = connectionName(whichConnection)

    return watchTube(connection, tubeName)
      .then((numWatched) => reserveJob(connection))
      .then((job) => workJob(job)
           .then(() => deleteJob(connection, job.id))
           .catch((err) => {
             deleteJob(connection, job.id)
              .then(() => console.log(err.stack))
           })
      )
      .then(() => {
        // Do it again...
        process.nextTick(() => processJobsInTube(connection, tubeName, workJob))
      })
      .catch((err) => {
        console.log(err.stack)
        process.nextTick(() => processJobsInTube(connection, tubeName, workJob))
      })
  }

  const processRobotJobsInTube = (whichConnection, tubeName, workObj) => {
    var connection = connectionName(whichConnection)

    return watchTube(connection, tubeName)
      .then((numWatched) => reserveJob(connection))
      .then((job) => {
        return workObj.process(job)
          .then(() => {
            return deleteJob(connection, job.id)
          })
          .catch((err) => {
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
        console.log((err.stack) ? err.stack : err)
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
