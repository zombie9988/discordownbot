const Discord = require('discord.js')
const fs = require('fs')
const lame = require('lame')
const mkdirp = require('mkdirp')
const childProcess = require('child_process')
const { Readable } = require('stream')

class Silence extends Readable {
  _read () {
    this.push(Buffer.from([0xf8, 0xff, 0xfe]))
  }
}

module.exports = class Recorder {
  constructor () {}

  getRandomInt (min, max) {
    return Math.floor(Math.random() * (max - min)) + min
  }

  connectToVoiceChat (member, channel) {
    try {
      member.voice
        .setChannel(channel)
        .then(member => {})
        .catch(err => {
          console.log("Can't connect user to channel")
        })
    } catch (error) {
      console.log("Can't connect user to channel")
    }
  }

  saveResults (player, dirname) {
    var webDirname = '/var/www/html/' + dirname + '/' + player.tag
    var dirnamePlayer = dirname + '/' + player.tag
    var execCmd =
      'ffmpeg -i "concat:' +
      childProcess
        .execSync('ls -1v ' + dirnamePlayer + '/*.mp3')
        .toString()
        .split('\n')
        .join('|') +
      '" -acodec copy ' +
      webDirname +
      '/ouput.mp3'
    mkdirp.sync(webDirname)

    try {
      childProcess.execSync(execCmd).toString()
    } catch (error) {
      console.log('No audio for ' + player.tag)
    }
  }

  finishGame (
    firstPlayer,
    secondPlayer,
    dirname,
    guildChannel,
    textChannel,
    category
  ) {
    this.saveResults(firstPlayer, dirname)
    this.saveResults(secondPlayer, dirname)

    guildChannel.delete()
    textChannel.delete()
    category.delete()
    this.client.destroy()

    //console.log(botToken)
  }

  startRecord (botToken, firstPlayerID, secondPlayerID, guildId, callback) {
    this.client = new Discord.Client()

    this.token = botToken
    this.guildId = guildId
    this.client.login(this.token)
    this.questions = fs
      .readFileSync('questions.txt')
      .toString()
      .split('\r\n')
    var that = this

    this.client.on('ready', () => {
      console.log('Recorder ready')

      that.firstPlayer = that.client.users.resolve(firstPlayerID)
      that.firstMember = that.client.guilds
        .resolve(that.guildId)
        .members.resolve(that.firstPlayer)

      that.secondPlayer = that.client.users.resolve(secondPlayerID)
      that.secondMember = that.client.guilds
        .resolve(that.guildId)
        .members.resolve(that.secondPlayer)

      new Promise(function (resolve, reject) {
        //console.log(that)
        var localGuild = that.firstMember.guild
        var channelName = that.firstPlayer.tag + ' ' + that.secondPlayer.tag
        localGuild.channels
          .create(channelName, {
            type: 'category'
          })
          .then(category => {
            localGuild.channels
              .create(channelName, {
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
                  .create(channelName, {
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

                      var dirnameFirstPlayer =
                        dirname + '/' + that.firstPlayer.tag
                      var dirnameSecondPlayer =
                        dirname + '/' + that.secondPlayer.tag

                      mkdirp.sync(dirname)
                      mkdirp.sync(dirnameFirstPlayer)
                      mkdirp.sync(dirnameSecondPlayer)

                      that.connectToVoiceChat(that.firstMember, guildChannel)
                      that.connectToVoiceChat(that.secondMember, guildChannel)

                      var questionCounter = 0
                      var usedNumbers = []
                      var firstTurn = true
                      var firstInGame, secondInGame, nextPlayer

                      var playerChunks = {
                        firstPlayerChunk: 0,
                        secondPlayerChunk: 0
                      }

                      textChannel.send(prompts.textConnect)

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
                              that.finishGame(
                                that.firstPlayer,
                                that.secondPlayer,
                                dirname,
                                guildChannel,
                                textChannel,
                                category
                              )

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
                        }
                      })

                      that.client.on('message', msg => {
                        if (
                          msg.content.startsWith(config.prefix + 'finish') &&
                          msg.channel.id == textChannel.id
                        ) {
                          that.connectToVoiceChat(that.firstMember, null)
                          that.connectToVoiceChat(that.secondMember, null)
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
                            textChannel.send(prompts.noMoreQuestions)
                            return
                          }

                          var nextQuestion
                          do {
                            nextQuestion = that.getRandomInt(
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
        callback(result)
      })
    })
  }
}
