const Discord = require('discord.js')
const client = new Discord.Client()
const fs = require('fs')
const lame = require('lame')
const mkdirp = require('mkdirp')
const mp3cut = require('child_process')

const { Readable } = require('stream')

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
        msg.channel.send('Who is interested?')
        this.interestedState = 1
        this.firstPlayer = msg.author
        this.firstMember = msg.member
        return
      }

      if (
        msg.content.startsWith(config.prefix + 'startgame') &&
        this.interestedState == 1
      ) {
        this.secondPlayer = msg.author
        this.secondMember = msg.member
        this.guildId = msg.guild.id
        this.interestedState = 0

        if (this.unusedToken.length == 0) {
          msg.channel.send('Sorry, no free recorders')
          return
        }

        let recorder = new Recorder()
        var that = this
        recorder.startRecord(
          this.unusedToken.pop(),
          this.firstPlayer.id,
          this.secondPlayer.id,
          this.guildId,
          oldToken => {
            //console.log(oldToken)
            that.unusedToken.push(oldToken)
          }
        )
      }
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
      that.firstMember = that.client.guilds
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

                      var playerChunks = {
                        firstPlayerChunk: 0,
                        secondPlayerChunk: 0
                      }

                      var playersRates = {
                        firstPlayerRate: false,
                        secondPlayerRate: false
                      }

                      var playersFeedback = {
                        firstPlayerFeedback: false,
                        secondPlayerFeedback: false
                      }

                      var nextPlayer = that.firstPlayer
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
                              fs.writeFileSync(
                                dirname + '/rate.txt',
                                that.firstPlayer.tag +
                                  ': ' +
                                  playersRates.firstPlayerRate +
                                  '\n' +
                                  that.secondPlayer.tag +
                                  ': ' +
                                  playersRates.secondPlayerRate +
                                  '\n'
                              )

                              fs.writeFileSync(
                                dirname + '/feedback.txt',
                                that.firstPlayer.tag +
                                  ': ' +
                                  playersFeedback.firstPlayerFeedback +
                                  '\n' +
                                  that.secondPlayer.tag +
                                  ': ' +
                                  playersFeedback.secondPlayerFeedback +
                                  '\n'
                              )

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

                              guildChannel.leave()
                              guildChannel.delete()
                              textChannel.delete()
                              category.delete()
                              that.client.destroy()
                              //console.log(botToken)
                              resolve(botToken)
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
                        //console.log(msg.content)
                        if (
                          rateGameFlag &&
                          msg.channel.id == textChannel.id &&
                          (msg.author.id == that.firstPlayer.id ||
                            msg.author.id == that.secondPlayer.id)
                        ) {
                          if (Number(msg.content)) {
                            if (1 <= Number(msg.content) <= 5) {
                              if (msg.author.id == that.firstPlayer.id) {
                                playersRates.firstPlayerRate = msg.content
                              } else if (
                                msg.author.id == that.secondPlayer.id
                              ) {
                                playersRates.secondPlayerRate = msg.content
                              }
                            } else {
                              textChannel.send(
                                'Bad number (Need to be from 1 to 5)'
                              )
                            }
                          } else {
                            textChannel.send('Answer need to be a number')
                          }

                          if (
                            playersRates.firstPlayerRate &&
                            playersRates.secondPlayerRate
                          ) {
                            textChannel.send(
                              'Do you have any feedback (optional):'
                            )
                            rateGameFlag = false
                            feedbackFlag = true
                          }
                        }

                        if (
                          feedbackFlag &&
                          msg.channel.id == textChannel.id &&
                          (msg.author.id == that.firstPlayer.id ||
                            msg.author.id == that.secondPlayer.id)
                        ) {
                          if (msg.author.id == that.firstPlayer.id) {
                            if (!playersFeedback.firstPlayerFeedback) {
                              playersFeedback.firstPlayerFeedback = msg.content
                            } else {
                              playersFeedback.firstPlayerFeedback +=
                                '\n' + msg.content
                            }
                          } else if (msg.author.id == that.secondPlayer.id) {
                            if (!playersFeedback.secondPlayerFeedback) {
                              playersFeedback.secondPlayerFeedback = msg.content
                            } else {
                              playersFeedback.secondPlayerFeedback +=
                                '\n' + msg.content
                            }
                          }

                          if (
                            playersRates.firstPlayerRate &&
                            playersRates.secondPlayerRate
                          ) {
                            textChannel.send(
                              'All right! If you are finished just leave the voice chat'
                            )
                          }
                        }

                        if (
                          msg.content.startsWith(config.prefix + 'finish') &&
                          msg.channel.id == textChannel.id &&
                          !finishFlag
                        ) {
                          finishFlag = true
                          textChannel.send('Thank you for playing')
                          textChannel.send(
                            'You just finished playing. How would you rate your experience: 1 (bad) - 5 (great)?'
                          )
                          rateGameFlag = true
                        }

                        if (
                          msg.content.startsWith(config.prefix + 'restart') &&
                          msg.channel.id == textChannel.id
                        ) {
                          finishFlag = false
                          rateGameFlag = false
                          feedbackFlag = false

                          playersRates = {
                            firstPlayerRate: false,
                            secondPlayerRate: false
                          }

                          playersFeedback = {
                            firstPlayerFeedback: false,
                            secondPlayerFeedback: false
                          }

                          questionCounter = 0
                          usedNumbers = []
                          nextPlayer = that.firstPlayer
                          textChannel.send(
                            'Game Restarted , ' + msg.author.tag + ', type /next'
                          )
                        }

                        if (
                          msg.content.startsWith(config.prefix + 'next') &&
                          msg.channel.id == textChannel.id &&
                          !finishFlag &&
                          nextPlayer.id == msg.author.id
                        ) {
                          var nextQuestion
                          do {
                            nextQuestion = getRandomInt(
                              0,
                              that.questions.length
                            )
                          } while (usedNumbers.includes(nextQuestion))
                          usedNumbers.push(nextQuestion)

                          if (nextPlayer.id != that.firstPlayer.id) {
                            nextPlayer = that.firstPlayer
                          } else {
                            nextPlayer = that.secondPlayer
                            questionCounter += 1

                            if (questionCounter == 6) {
                              finishFlag = true
                              textChannel.send('Thank you for playing')
                              textChannel.send(
                                'You just finished playing. How would you rate your experience: 1 (bad) - 5 (great)?'
                              )
                              rateGameFlag = true
                              return
                            }
                          }

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
