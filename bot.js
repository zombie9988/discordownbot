const Discord = require('discord.js');
const client = new Discord.Client();
const fs = require('fs')
const lame = require('lame')
const mkdirp = require('mkdirp');

const { Readable } = require('stream');

class Silence extends Readable {
  _read() {
    this.push(Buffer.from([0xF8, 0xFF, 0xFE]));
  }
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

var questions = fs.readFileSync('questions.txt').toString().split('\r\n')
//console.log(questions)

var config = {
    prefix: '/',
    token: 'NjkyMzE1ODY0NTI3MDExODQw.XnsyBw.hWhSA3J9NfMaL3DG2Cd7EHgkBWQ',
}

interestedState = 0
var firstPlayer;

client.on('message', msg => {
  if (msg.content.startsWith(config.prefix + 'startgame') && interestedState == 0) {
    msg.channel.send("Who is interested?");
    interestedState = 1;
    firstPlayer = msg.author;
    return
  }

  if (msg.content.startsWith(config.prefix + 'startgame') && interestedState == 1) {
      var secondPlayer = msg.author;
      interestedState = 2

      msg.guild.channels.create(firstPlayer.tag + " " + secondPlayer.tag, 
      {
          type: 'voice', 
          permissionOverwrites: [
            {
                id: msg.guild.roles.everyone,
                deny: ['CONNECT']
            },
            {
                id: firstPlayer.id,
                allow: ['CONNECT']
            },
            {
                id: secondPlayer.id,
                allow: ['CONNECT']
            },
          ]
      }
      ).then(guildChannel => {
        msg.guild.channels.create(firstPlayer.tag + " " + secondPlayer.tag, 
        {
            type: 'text', 
            permissionOverwrites: [
              {
                  id: msg.guild.roles.everyone,
                  deny: ['READ_MESSAGE_HISTORY', 'SEND_MESSAGES', 'VIEW_CHANNEL']
              },
              {
                  id: firstPlayer.id,
                  allow: ['READ_MESSAGE_HISTORY', 'SEND_MESSAGES', 'VIEW_CHANNEL']
              },
              {
                  id: secondPlayer.id,
                  allow: ['READ_MESSAGE_HISTORY', 'SEND_MESSAGES', 'VIEW_CHANNEL']
              },
            ]
        }
        ).then(textChannel => {
          guildChannel.join().then(conn => {
            var usedNumbers = []
            var dirname = './recordings/' + firstPlayer.tag + " " + secondPlayer.tag + " " + Date.now() 
            mkdirp.sync(dirname)
            mkdirp.sync(dirname + "/" + firstPlayer.tag)
            mkdirp.sync(dirname + "/" + secondPlayer.tag)

            var finishFlag = false
            var rateGameFlag = false
            var feedbackFlag = false

            var playersRates = {
              firstPlayerRate: false,
              secondPlayerRate: false,
            }

            var playersFeedback = {
              firstPlayerFeedback: false,
              secondPlayerFeedback: false,
            }

            var nextQuestion = getRandomInt(0, questions.length)
            textChannel.send(questions[nextQuestion])
            usedNumbers.push(nextQuestion)

            conn.play(new Silence(), {type: 'opus'})
            var playerChunks = {
              firstPlayerChunk: 0,
              secondPlayerChunk: 0,
            }
            
            client.on('voiceStateUpdate', (oldState, newState) => {
              if (oldState.member.id == firstPlayer || oldState.member.id == secondPlayer) {
                if (oldState.channelID == guildChannel.id && newState.channelID != guildChannel.id) {
                  msg.channel.send("Game is Over: " + oldState.member.user.tag + " leave from channel")

                  fs.writeFileSync(dirname + "/rate.txt", firstPlayer.tag + ": " + playersRates.firstPlayerRate + "\n" +
                                                          secondPlayer.tag + ": " + playersRates.secondPlayerRate + "\n")

                  fs.writeFileSync(dirname + "/feedback.txt", firstPlayer.tag + ": " + playersFeedback.firstPlayerFeedback + "\n" +
                                                          secondPlayer.tag + ": " + playersFeedback.secondPlayerFeedback + "\n")
                  guildChannel.leave();
                  guildChannel.delete();
                  textChannel.delete();
                  interestedState = 0;
                  return;
                }
              }
            }); 

            conn.on('speaking', (user, state) => {
                //console.log(user)
                if (state.bitfield != 0 && user) {
                        var chunkCounter = 0;
                        if (user.id == firstPlayer.id) {
                          playerChunks.firstPlayerChunk += 1
                          chunkCounter = playerChunks.firstPlayerChunk
                        }

                        if (user.id == secondPlayer.id) {
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
                          mode: lame.STEREO,
                        })

                        let audio = conn.receiver.createStream(user, { mode: 'pcm' });
                        audio.pipe(encoder);
                        encoder.pipe(fs.createWriteStream(dirname + "/" + user.tag + "/" + chunkCounter + ".mp3"))

                        audio.on('data', (chunk) => {
                            //(`Received ${chunk.length} bytes of data.`);
                        });
                }
            })


            client.on('message', msg => {
              //console.log(msg.content)
              if (rateGameFlag && msg.channel.id == textChannel.id && (msg.author.id == firstPlayer.id || msg.author.id == secondPlayer.id)) {
                if (Number(msg.content)) {
                  if (1 <= Number(msg.content) <= 5) {
                    if (msg.author.id == firstPlayer.id) {
                      playersRates.firstPlayerRate = msg.content
                    } else if (msg.author.id == secondPlayer.id) {
                      playersRates.secondPlayerRate = msg.content
                    }
                  } else {
                    textChannel.send("Bad number (Need to be from 1 to 5)")
                  }
                } else {
                  textChannel.send("Answer need to be a number")
                }

                if (playersRates.firstPlayerRate && playersRates.secondPlayerRate) {
                  textChannel.send("Do you have any feedback (optional):")
                  rateGameFlag = false
                  feedbackFlag = true
                }
              }

              if (feedbackFlag && msg.channel.id == textChannel.id && (msg.author.id == firstPlayer.id || msg.author.id == secondPlayer.id)) {
                if (msg.author.id == firstPlayer.id) {
                  if (!playersFeedback.firstPlayerFeedback) {
                    playersFeedback.firstPlayerFeedback = msg.content
                  } else {
                    playersFeedback.firstPlayerFeedback += "\n" + msg.content
                  }
                } else if (msg.author.id == secondPlayer.id) {
                  if (!playersFeedback.secondPlayerFeedback) {
                    playersFeedback.secondPlayerFeedback = msg.content
                  } else {
                    playersFeedback.secondPlayerFeedback += "\n" + msg.content
                  }
                }

                if (playersRates.firstPlayerRate && playersRates.secondPlayerRate) {
                  textChannel.send("All right! If you are finished just leave the voice chat")
                }
              }

              if (msg.content.startsWith(config.prefix + 'finish') && msg.channel.id == textChannel.id && !finishFlag) {
                finishFlag = true

                textChannel.send("You just finished playing. How would you rate your experience: 1 (bad) - 5 (great)?");
                rateGameFlag = true 
              }

              if (msg.content.startsWith(config.prefix + 'next')  && msg.channel.id == textChannel.id && !finishFlag) {
                if (questions.length == usedNumbers.length) {
                  textChannel.send("Questions are over!")
                  return
                }

                do {
                  var nextQuestion = getRandomInt(0, questions.length)
                } while (usedNumbers.includes(nextQuestion))

                textChannel.send(questions[nextQuestion])
                usedNumbers.push(nextQuestion)
              }
            });
          })
      })
    })
  }
});

client.login(config.token);

client.on('ready', () => {
  console.log('ready!');
});