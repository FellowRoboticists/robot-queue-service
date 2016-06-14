#!/usr/bin/env node
'use strict'

const program = require('commander')
const async = require('async')
const winston = require('winston')

const queue = require('../lib/index')

program
  .version('0.0.1')
  .option('--host <host>', 'Hostname of beanstalk server (default: localhost)', 'localhost')
  .option('-p --port <port>', 'Port number of beanstalk server (default: 11300)', parseInt, 11300)
  .option('-c --command <command>', 'Specify the command to run (default: tubes)', 'tubes')
  .option('-t --tube <tube>', 'The tube to use (default: default)', 'default')
  .option('-v --verbose', 'Be verbose when processing')
  .option('--priority <priority>', 'Set the priority of the job to be queued (default: 100)', parseInt, 100)
  .option('--delay <delay>', 'Number of seconds to delay before making the job ready (default: 0)', parseInt, 0)
  .option('--ttr <ttr>', 'Maximum number of seconds allocated to run the job (default: 30)', parseInt, 30)
  .parse(process.argv)

if (program.verbose) {
  console.log('Options: ')
  console.log(`  Host:     ${program.host}`)
  console.log(`  Port:     ${program.port}`)
  console.log(`  Comand:   ${program.command}`)
  console.log(`  Tube:     ${program.tube}`)
  console.log(`  Verbose:  ${program.verbose}`)
  console.log(`  Priority: ${program.priority}`)
  console.log(`  Delay:    ${program.delay}`)
  console.log(`  Ttr:      ${program.ttr}`)
  console.log(`  Argument: ${program.args}`)
  console.log()
}

const tubes = () => {
  return queue.listTubes(null)
    .then((tubeNames) => {
      console.log('Available Tubes')
      console.log('---------------')
      tubeNames.forEach((tubeName) => console.log(`* ${tubeName}`))
    })
}

const stats = () => {
  return queue.listTubes(null)
    .then((tubeNames) => {
      return new Promise((resolve, reject) => {
        async.eachSeries(tubeNames, (tubeName, cb) => {
          console.log(`Statistics for tube: ${tubeName}`)
          queue.getTubeStatistics(null, tubeName)
            .then((tubeStats) => {
              console.log(`   - ready       ${tubeStats['current-jobs-ready']}`)
              console.log(`   - reserved    ${tubeStats['current-jobs-reserved']}`)
              console.log(`   - delayed     ${tubeStats['current-jobs-delayed']}`)
              console.log(`   - buried      ${tubeStats['current-jobs-buried']}`)
              console.log(`   - using       ${tubeStats['current-using']}`)
              console.log(`   - watching    ${tubeStats['current-watching']}`)

              cb()
            })
            .catch(cb)
        }, (err) => {
          if (err) return reject(err)
          resolve()
        })
      })
    })
}

const wargs = (options) => {
  return new Promise((resolve, reject) => {
    if (options.args.length > 0) {
      console.log(`Do something with the args: ${options.args}`)
      resolve()
    } else {
      reject(new Error('Must specify an argument (or two)'))
    }
  })
}

const enqueue = (options) => {
  if (options.args.length < 1) {
    throw new Error('Must specify argument containing the job to queue')
  }

  return queue.queueJob(null,
                        options.tube,
                        options.priority,
                        options.delay,
                        options.ttr,
                        options.args[0])
    .then((jobId) => console.log(`Queued '${options.args[0]}' in job ${jobId}`))
}

const __workJob = (job) => {
  return new Promise((resolve, reject) => {
    // reject(new Error('Just faking an error'))
    console.log('Processing job: ')
    console.log(`  Job id: ${job.id}`)
    console.log(`  Job Payload: ${job.payload}`)
    resolve()
  })
}

const listen = (options) => queue.processJobsInTube(null, options.tube, __workJob)

const commands = {
  tubes: tubes,
  stats: stats,
  enqueue: enqueue,
  listen: listen,
  wargs: wargs
}

const handleConnect = (reconnectCount = 0) => {
  queue.connect(null, program.host, program.port, handleConnect, reconnectCount)
    .then((client) => {
      if (!client) {
        winston.log('debug', 'No client connected; skipping')
        return
      }
      if (commands[program.command]) {
        return commands[program.command](program)
      } else {
        throw new Error(`Invalid command: ${program.command}`)
      }
    })
    .then(() => {
      if (program.command !== 'listen') {
        process.exit()
      }
    })
    .catch((err) => {
      winston.log('error', 'Error processing command:')
      winston.log('error', err.stack)
      process.exit()
    })
}

handleConnect()
