const Discord = require('discord.js');
const client = new Discord.Client();
const fs = require('fs')
const lame = require('lame')
const mkdirp = require('mkdirp');
const mp3cut = require('child_process')

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

var config = require("./config.json")
interestedState = 0
var firstPlayer;
var firstMember;
client.on('message', msg => {
  if (msg.content.startsWith(config.prefix + 'startgame') && interestedState == 0) {
    msg.channel.send("Who is interested?");
    interestedState = 1;
    firstPlayer = msg.author;
    firstMember = msg.member;
    return
  }

  if (msg.content.startsWith(config.prefix + 'startgame') && interestedState == 1) {
      var secondPlayer = msg.author;
      var secondMember = msg.member;
      interestedState = 2

      msg.guild.channels.create(firstPlayer.tag + " " + secondPlayer.tag, 
      {
          type: 'voice', 
          permissionOverwrites: [
            {
                id: msg.guild.roles.everyone,
                deny: ['CONNECT', "CREATE_INSTANT_INVITE", "VIEW_CHANNEL", "SPEAK"]
            },
            {
                id: firstPlayer.id,
                allow: ['CONNECT', "VIEW_CHANNEL", "SPEAK"]
            },
            {
                id: secondPlayer.id,
                allow: ['CONNECT', "VIEW_CHANNEL", "SPEAK"]
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
                  deny: ['CREATE_INSTANT_INVITE', 'READ_MESSAGE_HISTORY', 'SEND_MESSAGES', 'VIEW_CHANNEL']
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
            
            var dirname = './recordings/' + firstPlayer.tag + "-" + secondPlayer.tag + "-" + Date.now()
            

            mkdirp.sync(dirname)
            mkdirp.sync(dirname + "/" + firstPlayer.tag)
            mkdirp.sync(dirname + "/" + secondPlayer.tag)

            firstMember.voice.setChannel(guildChannel).then(member => {
            })

            secondMember.voice.setChannel(guildChannel).then(member => {
            })

            var questionCounter = 0
            var usedNumbers = []
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

            var nextPlayer = firstPlayer
            textChannel.send("Greetings! Type /next to start")

            conn.play(new Silence(), {type: 'opus'})
            var playerChunks = {
              firstPlayerChunk: 0,
              secondPlayerChunk: 0,
            }
            
            client.on('voiceStateUpdate', (oldState, newState) => {
              if (oldState.member.id == firstPlayer || oldState.member.id == secondPlayer) {
                if (oldState.channelID == guildChannel.id && newState.channelID != guildChannel.id && guildChannel.members.array().length == 1) {
                  msg.channel.send("Game is Over: " + oldState.member.user.tag + " leave from channel")

                  fs.writeFileSync(dirname + "/rate.txt", firstPlayer.tag + ": " + playersRates.firstPlayerRate + "\n" +
                                                          secondPlayer.tag + ": " + playersRates.secondPlayerRate + "\n");

                  fs.writeFileSync(dirname + "/feedback.txt", firstPlayer.tag + ": " + playersFeedback.firstPlayerFeedback + "\n" +
                                                          secondPlayer.tag + ": " + playersFeedback.secondPlayerFeedback + "\n");
                  
                  mkdirp.sync("/var/www/html/" + dirname + "/" + firstPlayer.tag)
                  mkdirp.sync("/var/www/html/" + dirname + "/" + secondPlayer.tag)

                  try {
                    mp3cut.execSync('mp3wrap ' + "/var/www/html/" + dirname + "/" + firstPlayer.tag + '/ouput.mp3 `ls -1v ' + dirname + '/' + firstPlayer.tag + '/*.mp3`')
                  } catch (error) {
                    console.log("No audio for " + firstPlayer.tag)
                  }
                  
                  try {
                    mp3cut.execSync('mp3wrap ' + "/var/www/html/" + dirname + "/" + secondPlayer.tag + '/ouput.mp3 `ls -1v ' + dirname + '/' + secondPlayer.tag + '/*.mp3`')
                  } catch (error) {
                    console.log("No audio for " + secondPlayer.tag)
                  }

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
                textChannel.send("Thank you for playing")
                textChannel.send("You just finished playing. How would you rate your experience: 1 (bad) - 5 (great)?");
                rateGameFlag = true 
              }
              
              if (msg.content.startsWith(config.prefix + 'restart')  && msg.channel.id == textChannel.id) {
                finishFlag = false
                rateGameFlag = false
                feedbackFlag = false

                playersRates = {
                  firstPlayerRate: false,
                  secondPlayerRate: false,
                }

                playersFeedback = {
                  firstPlayerFeedback: false,
                  secondPlayerFeedback: false,
                }

                questionCounter = 0
                usedNumbers = []

                textChannel.send("Game was restarted! Type /next to continue")
              }

              if (msg.content.startsWith(config.prefix + 'next')  && msg.channel.id == textChannel.id && !finishFlag && nextPlayer.id == msg.author.id) {
                if (questions.length == usedNumbers.length) {
                  textChannel.send("Questions are over!")
                  return
                }

                var nextQuestion
                do {
                  nextQuestion = getRandomInt(0, questions.length)
                } while (usedNumbers.includes(nextQuestion))
                usedNumbers.push(nextQuestion)

                if (nextPlayer.id != firstPlayer.id) {
                  nextPlayer = firstPlayer
                } else {
                  nextPlayer = secondPlayer
                  questionCounter += 1

                  if (questionCounter == 6) {
                    finishFlag = true
                    textChannel.send("Thank you for playing")
                    textChannel.send("You just finished playing. How would you rate your experience: 1 (bad) - 5 (great)?");
                    rateGameFlag = true
                    return
                  }
                }

                textChannel.send(nextPlayer.tag + " turn!")
                textChannel.send("Question #" + questionCounter + " is: " + questions[nextQuestion])
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
  client.
});