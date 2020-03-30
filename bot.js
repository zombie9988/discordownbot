const Discord = require('discord.js')
const client = new Discord.Client()
const fs = require('fs')
const lame = require('lame')
const mkdirp = require('mkdirp')
const mp3cut = require('child_process')

const { Readable } = require('stream')

process.on("unhandledRejection", (ex) => {
  console.log( "Unhandled promise rejection", ex);
});

process.on("uncaughtException", (ex) => {
  console.log("Uncaught exception", ex);
});

class Silence extends Readable {
  _read () {
    this.push(Buffer.from([0xf8, 0xff, 0xfe]))
  }
}

function getRandomInt (min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

class Listener {
  constructor (botToken, additionalTokens) {
    this.token = botToken
    this.client = new Discord.Client()
    this.alreadyPlay = []

    this.client.login(this.token)

    this.client.on('ready', () => {
      console.log('Listener ready')
    })

    this.unusedToken = additionalTokens

    this.interestedState = 0

    this.client.on('message', msg => {
      if (
        msg.content.startsWith(config.prefix + 'startgame') &&
        this.interestedState == 0
      ) {
        if (this.unusedToken.length == 0) {
          msg.channel.send('Sorry, no free recorders')
          return
        }

        if (this.alreadyPlay.includes(msg.author.id)) {
          msg.channel.send("You already in game")
          return
        }
        msg.channel.send('Who is interested?')
        this.interestedState = 1
        this.firstPlayer = msg.author
        this.firstMember = msg.member
        this.alreadyPlay.push(msg.author.id)
        return
      }

      if (
        msg.content.startsWith(config.prefix + 'startgame') &&
        this.interestedState == 1
      ) {

        if (this.alreadyPlay.includes(msg.author.id)) {
          msg.channel.send("You already in game")
          return
        }
        this.secondPlayer = msg.author
        this.secondMember = msg.member
        try {
          this.guildId = msg.guild.id  
        } catch (error) {
          console.log("Ls error")
          return
        }
        
        this.interestedState = 0

        if (this.unusedToken.length == 0) {
          msg.channel.send('Sorry, no free recorders')
          return
        }

        this.alreadyPlay.push(msg.author.id)
        let recorder = new Recorder()

        recorder.startRecord(
          this.unusedToken.pop(),
          this.firstPlayer.id,
          this.secondPlayer.id,
          this.guildId,
          inputData => this.askQuestions(inputData)
        )
      }
    })
  }

  askQuestions (inputData) {
    //console.log(inputData)
    this.unusedToken.push(inputData.token)
    var dirname = inputData.dir
    var firstPlayer = inputData.firstP
    var secondPlayer = inputData.secondP
    var firstMember = this.client.guilds
        .resolve(this.guildId)
        .members.resolve(firstPlayer)

    var secondMember = this.client.guilds
        .resolve(this.guildId)
        .members.resolve(secondPlayer)

    
    this.alreadyPlay.splice(this.alreadyPlay.indexOf(firstPlayer.id), 1)
    this.alreadyPlay.splice(this.alreadyPlay.indexOf(secondPlayer.id), 1)
    var waitTime = 60000
    var that = this
    var firstPlayerRate
    var firstPlayerFeedback
    var secondPlayerRate
    var secondPlayerFeedback
    firstMember.createDM().then(dmChannel => {
      dmChannel
        .send(
          'You just finished playing. How would you rate your experience: 1 (bad) - 5 (great)?'
        )
        .then(msg => {
          // Errors: ['time'] treats ending because of the time limit as an error
          const filter = msg => {
            if (Number(msg.content)) {
              if (1 <= Number(msg.content) <= 5) {
                firstPlayerRate = msg.content
                return true
              } else {
                return false
              }
            } else {
              return false
            }
          }
          dmChannel
            .awaitMessages(filter, {
              max: 1,
              time: waitTime,
              errors: ['time']
            })
            .then(collected =>
              dmChannel
                .send('Do you have any feedback (optional):')
                .then(msg => {
                  const filter = msg => {
                    firstPlayerFeedback = msg.content
                    return true
                  }
                  dmChannel
                    .awaitMessages(filter, {
                      max: 1,
                      time: waitTime,
                      errors: ['time']
                    })
                    .then(collected => {
                      dmChannel.send('Thank you for playing')
                      try {
                        firstMember.voice
                          .setChannel(null)
                          .then(member => {})
                      } catch (error) {
                        console.log("Can't connect first user to channel")
                      }
                    })
                    .catch(collected => {
                      dmChannel.send('Thank you for playing')
                      try {
                        firstMember.voice
                          .setChannel(null)
                          .then(member => {})
                      } catch (error) {
                        console.log("Can't connect first user to channel")
                      }
                    })
                    .finally(() => {
                      fs.appendFileSync(
                        dirname + '/rate.csv',
                        firstPlayer.tag + ',' + firstPlayerRate + '\n'
                      )

                      fs.appendFileSync(
                        dirname + '/feedback.csv',
                        firstPlayer.tag + ',' + firstPlayerFeedback + '\n'
                      )
                    })
                })
            )
            .catch(collected => {
              dmChannel.send('Thank you for playing')
              try {
                firstMember.voice.setChannel(null).then(member => {})
              } catch (error) {
                console.log("Can't connect first user to channel")
              }
            })
        })
    })

    secondMember.createDM().then(dmChannel => {
      dmChannel
        .send(
          'You just finished playing. How would you rate your experience: 1 (bad) - 5 (great)?'
        )
        .then(msg => {
          // Errors: ['time'] treats ending because of the time limit as an error
          const filter = msg => {
            if (Number(msg.content)) {
              if (1 <= Number(msg.content) <= 5) {
                secondPlayerRate = msg.content
                return true
              } else {
                return false
              }
            } else {
              return false
            }
          }
          dmChannel
            .awaitMessages(filter, {
              max: 1,
              time: waitTime,
              errors: ['time']
            })
            .then(collected =>
              dmChannel
                .send('Do you have any feedback (optional):')
                .then(msg => {
                  const filter = msg => {
                    secondPlayerFeedback = msg.content
                    return true
                  }
                  dmChannel
                    .awaitMessages(filter, {
                      max: 1,
                      time: waitTime,
                      errors: ['time']
                    })
                    .then(collected => {
                      dmChannel.send('Thank you for playing')
                      try {
                        secondMember.voice
                          .setChannel(null)
                          .then(member => {})
                      } catch (error) {
                        console.log("Can't connect first user to channel")
                      }
                    })
                    .catch(collected => {
                      dmChannel.send('Thank you for playing')
                      try {
                        secondMember.voice
                          .setChannel(null)
                          .then(member => {})
                      } catch (error) {
                        console.log("Can't connect first user to channel")
                      }
                    })
                    .finally(() => {
                      fs.appendFileSync(
                        dirname + '/rate.csv',
                        secondPlayer.tag + ',' + secondPlayerRate + '\n'
                      )

                      fs.appendFileSync(
                        dirname + '/feedback.csv',
                        secondPlayer.tag +
                          ',' +
                          secondPlayerFeedback +
                          '\n'
                      )
                    })
                })
            )
            .catch(collected => {
              dmChannel.send('Thank you for playing')
              try {
                secondMember.voice.setChannel(null).then(member => {})
              } catch (error) {
                console.log("Can't connect first user to channel")
              }
            })
        })
    })
  }
}

class Recorder {
  constructor () {}

  startRecord (botToken, firstPlayerID, secondPlayerID, guildId, callback) {
    this.token = botToken
    this.client = new Discord.Client()
    this.guildId = guildId
    this.client.login(this.token)
    this.questions = fs
      .readFileSync('questions.txt')
      .toString()
      .split('\r\n')
    var that = this
    var result
    this.client.on('ready', () => {
      console.log('Recorder ready')

      that.firstPlayer = that.client.users.resolve(firstPlayerID)
      that.secondPlayer = that.client.users.resolve(secondPlayerID)
      that.firstMember = that.client.guilds
        .resolve(that.guildId)
        .members.resolve(that.firstPlayer)
      that.secondMember = that.client.guilds
        .resolve(that.guildId)
        .members.resolve(that.secondPlayer)

      new Promise(function (resolve, reject) {
        //console.log(that)
        var localGuild = that.firstMember.guild
        localGuild.channels
          .create(that.firstPlayer.tag + ' ' + that.secondPlayer.tag, {
            type: 'category'
          })
          .then(category => {
            localGuild.channels
              .create(that.firstPlayer.tag + ' ' + that.secondPlayer.tag, {
                type: 'voice',
                permissionOverwrites: [
                  {
                    id: localGuild.roles.everyone,
                    deny: [
                      'CONNECT',
                      'CREATE_INSTANT_INVITE',
                      'VIEW_CHANNEL',
                      'SPEAK'
                    ]
                  },
                  {
                    id: that.firstPlayer.id,
                    allow: ['CONNECT', 'VIEW_CHANNEL', 'SPEAK']
                  },
                  {
                    id: that.secondPlayer.id,
                    allow: ['CONNECT', 'VIEW_CHANNEL', 'SPEAK']
                  }
                ]
              })
              .then(guildChannel => {
                guildChannel.setParent(category)
                console.log('New voice channel created!')
                localGuild.channels
                  .create(that.firstPlayer.tag + ' ' + that.secondPlayer.tag, {
                    type: 'text',
                    permissionOverwrites: [
                      {
                        id: localGuild.roles.everyone,
                        deny: [
                          'CREATE_INSTANT_INVITE',
                          'READ_MESSAGE_HISTORY',
                          'SEND_MESSAGES',
                          'VIEW_CHANNEL'
                        ]
                      },
                      {
                        id: that.firstPlayer.id,
                        allow: [
                          'READ_MESSAGE_HISTORY',
                          'SEND_MESSAGES',
                          'VIEW_CHANNEL'
                        ]
                      },
                      {
                        id: that.secondPlayer.id,
                        allow: [
                          'READ_MESSAGE_HISTORY',
                          'SEND_MESSAGES',
                          'VIEW_CHANNEL'
                        ]
                      },
                      {
                        id: that.client.user.id,
                        allow: [
                          'READ_MESSAGE_HISTORY',
                          'SEND_MESSAGES',
                          'VIEW_CHANNEL'
                        ]
                      }
                    ]
                  })
                  .then(textChannel => {
                    textChannel.setParent(category)
                    console.log('New text channel created!')
                    that.client.voice.joinChannel(guildChannel).then(conn => {
                      var dirname =
                        './recordings/' +
                        that.firstPlayer.tag +
                        '-' +
                        that.secondPlayer.tag +
                        '-' +
                        Date.now()
                      var firstTurn = true
                      var nextPlayer
                      mkdirp.sync(dirname)
                      mkdirp.sync(dirname + '/' + that.firstPlayer.tag)
                      mkdirp.sync(dirname + '/' + that.secondPlayer.tag)

                      try {
                        that.firstMember.voice
                          .setChannel(guildChannel)
                          .then(member => {})
                      } catch (error) {
                        console.log("Can't connect first user to channel")
                      }

                      try {
                        that.secondMember.voice
                          .setChannel(guildChannel)
                          .then(member => {})
                      } catch (error) {
                        console.log("Can't connect second user to channel")
                      }

                      var questionCounter = 0
                      var usedNumbers = []
                      var finishFlag = false
                      var rateGameFlag = false
                      var feedbackFlag = false
                      var firstInGame
                      var secondInGame
                      var playerChunks = {
                        firstPlayerChunk: 0,
                        secondPlayerChunk: 0
                      }

                      textChannel.send('Greetings! Type /next to start')

                      that.client.on(
                        'voiceStateUpdate',
                        (oldState, newState) => {
                          try {
                            conn.play(new Silence(), { type: 'opus' })
                          } catch (error) {
                            console.log('Trying to connect recorder')
                          }

                          if (
                            oldState.member.id == that.firstPlayer ||
                            oldState.member.id == that.secondPlayer
                          ) {
                            if (
                              oldState.channelID == guildChannel.id &&
                              newState.channelID != guildChannel.id &&
                              guildChannel.members.array().length == 1
                            ) {
                              mkdirp.sync(
                                '/var/www/html/' +
                                  dirname +
                                  '/' +
                                  that.firstPlayer.tag
                              )
                              mkdirp.sync(
                                '/var/www/html/' +
                                  dirname +
                                  '/' +
                                  that.secondPlayer.tag
                              )

                              try {
                                mp3cut.execSync(
                                  'mp3wrap ' +
                                    '/var/www/html/' +
                                    dirname +
                                    '/' +
                                    that.firstPlayer.tag +
                                    '/ouput.mp3 `ls -1v ' +
                                    dirname +
                                    '/' +
                                    that.firstPlayer.tag +
                                    '/*.mp3`'
                                )
                              } catch (error) {
                                console.log(
                                  'No audio for ' + that.firstPlayer.tag
                                )
                              }

                              try {
                                mp3cut.execSync(
                                  'mp3wrap ' +
                                    '/var/www/html/' +
                                    dirname +
                                    '/' +
                                    that.secondPlayer.tag +
                                    '/ouput.mp3 `ls -1v ' +
                                    dirname +
                                    '/' +
                                    that.secondPlayer.tag +
                                    '/*.mp3`'
                                )
                              } catch (error) {
                                console.log(
                                  'No audio for ' + that.secondPlayer.tag
                                )
                              }

                              //guildChannel.leave()
                              guildChannel.delete()
                              textChannel.delete()
                              category.delete()
                              that.client.destroy()
                              //console.log(botToken)
                              resolve({
                                token: botToken,
                                dir: dirname,
                                firstP: that.firstPlayer,
                                secondP: that.secondPlayer,
                                firstM: that.firstMember,
                                secondM: that.secondMember
                              })
                            }
                          }
                        }
                      )

                      conn.on('speaking', (user, state) => {
                        //console.log(user)
                        if (state.bitfield != 0 && user) {
                          var chunkCounter = 0
                          if (user.id == that.firstPlayer.id) {
                            playerChunks.firstPlayerChunk += 1
                            chunkCounter = playerChunks.firstPlayerChunk
                          }

                          if (user.id == that.secondPlayer.id) {
                            playerChunks.secondPlayerChunk += 1
                            chunkCounter = playerChunks.secondPlayerChunk
                          }

                          //console.log(state)

                          var encoder = new lame.Encoder({
                            channels: 2,
                            bitDepth: 16,
                            sampleRate: 48000,

                            bitRate: 128,
                            outSampleRate: 22050,
                            mode: lame.STEREO
                          })

                          let audio = conn.receiver.createStream(user, {
                            mode: 'pcm'
                          })
                          audio.pipe(encoder)
                          encoder.pipe(
                            fs.createWriteStream(
                              dirname +
                                '/' +
                                user.tag +
                                '/' +
                                chunkCounter +
                                '.mp3'
                            )
                          )

                          audio.on('data', chunk => {
                            //(`Received ${chunk.length} bytes of data.`);
                          })
                        }
                      })

                      that.client.on('message', msg => {
                        if (
                          msg.content.startsWith(config.prefix + 'finish') &&
                          msg.channel.id == textChannel.id &&
                          !finishFlag
                        ) {
                          finishFlag = true
                          
                          that.firstMember.voice
                            .setChannel(null)
                            .then(member => {})

                          that.secondMember.voice
                            .setChannel(null)
                            .then(member => {})
                        }

                        if (
                          msg.content.startsWith(config.prefix + 'restart') &&
                          msg.channel.id == textChannel.id
                        ) {
                          questionCounter = 0
                          usedNumbers = []
                          textChannel.send(
                            'Game Restarted , ' +
                              msg.author.tag +
                              ', type /next'
                          )
                          firstTurn = true
                        }

                        if (
                          msg.content.startsWith(config.prefix + 'next') &&
                          msg.channel.id == textChannel.id &&
                          !finishFlag &&
                          (firstTurn || nextPlayer.id == msg.author.id)
                        ) {
                          if (firstTurn) {
                            if (msg.author == that.firstPlayer) {
                              firstInGame = that.firstPlayer
                              secondInGame = that.secondPlayer
                            } else {
                              firstInGame = that.secondPlayer
                              secondInGame = that.firstPlayer
                            }
                            nextPlayer = secondInGame
                            firstTurn = false
                          }

                          if (nextPlayer.id != firstInGame.id) {
                            nextPlayer = firstInGame
                            questionCounter += 1
                          } else {
                            nextPlayer = secondInGame
                          }

                          if (questionCounter == 6) {
                            textChannel.send("Game is over! Type /finish or exit from voice channel")
                            return
                          }

                          var nextQuestion
                          do {
                            nextQuestion = getRandomInt(
                              0,
                              that.questions.length
                            )
                          } while (usedNumbers.includes(nextQuestion))
                          usedNumbers.push(nextQuestion)

                          textChannel.send(nextPlayer.tag + ' turn!')
                          textChannel.send(
                            'Question #' +
                              questionCounter +
                              ' is: ' +
                              that.questions[nextQuestion]
                          )
                        }
                      })
                    })
                  })
              })
          })
      }).then(result => {
        //console.log(result)
        callback(result)
      })
    })
  }
}

var config = require('./config.json')

var listener = new Listener(config.general_token, config.recorders_tokens)
