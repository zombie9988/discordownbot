const Discord = require("discord.js");
const fs = require("fs");
const lame = require("lame");
const mkdirp = require("mkdirp");
const childProcess = require("child_process");
const { Readable } = require("stream");
const EventEmitter = require("events");
const path = require("path");
class Silence extends Readable {
  _read() {
    this.push(Buffer.from([0xf8, 0xff, 0xfe]));
  }
}

class UsersEmmiter extends EventEmitter {}

module.exports = class Recorder {
  constructor(guildId, outTextChannel) {
    this.participantsArr = new Map();
    this.rawPlayers = [];
    this.maxPlayers = 4;
    this.guildId = guildId;
    this.outTextChannel = outTextChannel;
    this.eventEmitter = new UsersEmmiter();
  }

  getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
  }

  connectToVoiceChat(member, channel) {
    try {
      member.voice
        .setChannel(channel)
        .then((member) => {})
        .catch((err) => {
          console.log("Unable to automatically join a member.");
        });
    } catch (error) {
      console.log("Unable to automatically join a member.");
    }
  }

  saveResults(player, dirname) {
    var dirnamePlayer = dirname + "/" + player.tag;

    if (fs.existsSync(dirnamePlayer + "/output.mp3")) {
      this.wavDirs.push(dirnamePlayer + "/output.mp3");
    } else if (fs.existsSync(dirnamePlayer + "/result.mp3")) {
      fs.renameSync(
        dirnamePlayer + "/result.mp3",
        dirnamePlayer + "/output.mp3"
      );
      this.wavDirs.push(dirnamePlayer + "/output.mp3");
    } else {
      console.log("No audio for " + player.tag);
    }
  }

  hasStarted() {
    if (this.client == null) {
      return false;
    } else {
      return true;
    }
  }

  deleteTemp(dirname) {
    fs.readdir(dirname, (err, files) => {
      if (err) {
        console.log(`Delete trash error ${err}`);
      } else {
        files.forEach((file) => {
          var filepath = path.join(dirname, file);

          fs.stat(filepath, (err, stats) => {
            if (stats.isDirectory) {
              fs.readdir(filepath, (err, files) => {
                if (files) {
                  files.forEach((value) => {
                    if (value != "output.mp3") {
                      fs.unlinkSync(path.join(filepath, value));
                    }
                  });
                }
              });
            }
          });
        });
      }
    });
  }

  finishGame(dirname, guildChannel, textChannel, category) {
    this.wavDirs = [];
    var that = this;

    guildChannel.delete();
    textChannel.delete();
    category.delete();

    if (!fs.existsSync(dirname)) {
      mkdirp.sync(dirname);
    }

    this.recordedVoices.forEach((user) => {
      that.saveResults(user, dirname);
    });

    var allText = " ";
    that.chatHistory.forEach((value, index, array) => {
      allText += `${value} \n -------------------------------------------------------------------------------------\n`;
    });

    fs.writeFileSync(`${dirname}/chat.txt`, allText);
    if (this.wavDirs.length > 0) {
      if (this.wavDirs.length > 1) {
        childProcess.execSync(
          "sox -m " + this.wavDirs.join(" ") + " " + dirname + "/output.mp3"
        );
      } else if (this.wavDirs.length == 1) {
        fs.copyFileSync(this.wavDirs[0], `${dirname}/output.mp3`);
      }
    }

    this.deleteTemp(dirname);

    this.client.destroy();
  }

  resolveMemberFromPlayer(player, guild) {
    return {
      player: this.client.users.resolve(player.id),
      member: this.client.guilds
        .resolve(guild)
        .members.resolve(this.client.users.resolve(player.id)),
    };
  }

  askPermission(player) {
    var that = this;
    //this.localTextChannel.send(
    //  prompts.wantToJoin.replace("${player}", player.tag)
    //);
    return new Promise((resolve, reject) => {
      that.localTextChannel.send(
        prompts.wantToEnter.replace(
          /\$\{player\}/g,
          player.tag.slice(0, -5).toLowerCase()
        )
      );

      that.eventEmitter.on(player.tag.slice(0, -5).toLowerCase(), (result) => {
        if (result) {
          resolve();
        } else {
          reject();
        }
      });
    });
  }

  addParticipant(player, listener) {
    if (this.client == null) {
      if (!this.rawPlayers.includes(player)) {
        this.rawPlayers.push(player);
      }
      if (this.rawPlayers.length == 2) {
        return 1;
      }

      return 0;
    }

    if (this.rawPlayers.includes(player.tag.slice(0, -5).toLowerCase())) {
      this.outTextChannel.send(prompts.alreadyRequested);
      return 0;
    }

    if (this.participantsArr.size == this.maxPlayers) {
      this.outTextChannel.send(prompts.maxPlayersAlready);
      return 2; // 2 Is for max player riched
    }

    if (this.participantsArr.size >= 2) {
      this.rawPlayers.push(player.tag.slice(0, -5).toLowerCase());
      var that = this;
      this.askPermission(player)
        .then(() => {
          //console.log(`Then after ${player}`);
          var obj = that.resolveMemberFromPlayer(player, that.guildId);
          that.participantsArr.set(player.tag, obj);
          listener.alreadyPlay.set(player.tag.slice(0, -5).toLowerCase(), that);
          let roomName = that.participantsArr
            .keys()
            .next()
            .value.slice(0, -5)
            .toLowerCase();
          listener.launchedRoom.set(
            roomName,
            listener.launchedRoom.get(roomName) + 1
          );
          that.outTextChannel.send(
            prompts.accept.replace("${player}", player.tag)
          );
          that.localTextChannel.updateOverwrite(player.id, {
            READ_MESSAGE_HISTORY: true,
            SEND_MESSAGES: true,
            VIEW_CHANNEL: true,
          });

          that.localVoiceChannel.updateOverwrite(player.id, {
            CONNECT: true,
            VIEW_CHANNEL: true,
            SPEAK: true,
          });

          that.outTextChannel.send(`<@${player.id}>`, {
            files: ["./resources/images/image.png"],
          });
        })
        .catch(() => {
          that.outTextChannel.send(
            prompts.decline.replace("${player}", player.tag)
          );
        });

      return 0;
    }

    var obj = this.resolveMemberFromPlayer(player, this.guildId);
    this.participantsArr.set(player.tag, obj);
    listener.alreadyPlay.set(player.tag.slice(0, -5).toLowerCase(), this);
    if (this.participantsArr.size == 1) {
      this.firstPlayer = obj.player;
    }

    if (this.participantsArr.size == 2) {
      this.secondPlayer = obj.player;
      return 1; // 1 Is for create new recorder
    }

    return 0; // 0 Is for usual
  }

  startRecord(botToken, callback, listener) {
    this.client = new Discord.Client();
    this.token = botToken;
    this.client.login(this.token);

    this.questions = fs.readFileSync("questions.txt").toString().split("\r\n");
    var that = this;

    this.client.on("ready", () => {
      console.log("Recorder ready");
      that.rawPlayers.forEach((value, index) => {
        that.addParticipant(value, listener);
      });

      that.rawPlayers = [];
      //console.log(that.participantsArr);
      new Promise(function (resolve, reject) {
        var localGuild = that.participantsArr.values().next().value.member
          .guild;
        var channelName = that.firstPlayer.tag + " " + that.secondPlayer.tag;
        localGuild.channels
          .create(channelName, {
            type: "category",
          })
          .then((category) => {
            localGuild.channels
              .create(channelName, {
                type: "voice",
                permissionOverwrites: [
                  {
                    id: localGuild.roles.everyone,
                    deny: [
                      "CONNECT",
                      "CREATE_INSTANT_INVITE",
                      "VIEW_CHANNEL",
                      "SPEAK",
                    ],
                  },
                  {
                    id: that.firstPlayer.id,
                    allow: ["CONNECT", "VIEW_CHANNEL", "SPEAK"],
                  },
                  {
                    id: that.secondPlayer.id,
                    allow: ["CONNECT", "VIEW_CHANNEL", "SPEAK"],
                  },
                ],
              })
              .then((guildChannel) => {
                guildChannel.setParent(category);
                console.log("New voice channel created!");
                localGuild.channels
                  .create(channelName, {
                    type: "text",
                    permissionOverwrites: [
                      {
                        id: localGuild.roles.everyone,
                        deny: [
                          "CREATE_INSTANT_INVITE",
                          "READ_MESSAGE_HISTORY",
                          "SEND_MESSAGES",
                          "VIEW_CHANNEL",
                        ],
                      },
                      {
                        id: that.firstPlayer.id,
                        allow: [
                          "READ_MESSAGE_HISTORY",
                          "SEND_MESSAGES",
                          "VIEW_CHANNEL",
                        ],
                      },
                      {
                        id: that.secondPlayer.id,
                        allow: [
                          "READ_MESSAGE_HISTORY",
                          "SEND_MESSAGES",
                          "VIEW_CHANNEL",
                        ],
                      },
                      {
                        id: that.client.user.id,
                        allow: [
                          "READ_MESSAGE_HISTORY",
                          "SEND_MESSAGES",
                          "VIEW_CHANNEL",
                        ],
                      },
                    ],
                  })
                  .then((textChannel) => {
                    var startTime = null;
                    textChannel.send(prompts.hello);
                    textChannel.setParent(category);
                    that.localTextChannel = textChannel;
                    that.localVoiceChannel = guildChannel;
                    console.log("New text channel created!");
                    that.chatHistory = [];
                    that.client.voice.joinChannel(guildChannel).then((conn) => {
                      var dirname =
                        "./recordings/" +
                        that.firstPlayer.tag +
                        "-" +
                        that.secondPlayer.tag +
                        "-" +
                        Date.now();

                      that.recordedVoices = [];

                      that.outTextChannel.send(
                        `<@${that.firstPlayer.id}>, <@${that.secondPlayer.id}>`,
                        { files: ["./resources/images/image.png"] }
                      );
                      that.questionCounter = 0;
                      that.usedNumbers = [];

                      that.nextQuestion = "";
                      that.askQuestion(textChannel);
                      textChannel.send(prompts.textConnect);
                      that.client.on(
                        "voiceStateUpdate",
                        (oldState, newState) => {
                          try {
                            conn.play(new Silence(), { type: "opus" });
                          } catch (error) {
                            console.log("Trying to connect recorder");
                          }

                          if (oldState.member.id != that.client.user.id) {
                            if (
                              oldState.channelID == guildChannel.id &&
                              newState.channelID != guildChannel.id &&
                              guildChannel.members.length == 1
                            ) {
                              that.finishGame(
                                dirname,
                                guildChannel,
                                textChannel,
                                category
                              );

                              resolve({
                                token: botToken,
                                dir: dirname,
                                players: that.participantsArr,
                              });
                            }
                          }
                        }
                      );

                      var silenceTiming = new Map();
                      conn.on("speaking", (user, state) => {
                        if (
                          state.bitfield != 0 &&
                          user &&
                          user.id != that.client.user.id
                        ) {
                          if (startTime == null) {
                            startTime = Date.now();
                          }

                          if (silenceTiming.has(user.tag)) {
                            silenceTiming.set(
                              user.tag,
                              (Date.now() - silenceTiming.get(user.tag)) / 1000
                            );
                          } else {
                            silenceTiming.set(
                              user.tag,
                              (Date.now() - startTime) / 1000
                            );
                          }

                          if (that.recordedVoices.indexOf(user) <= -1) {
                            that.recordedVoices.push(user);
                          }

                          if (!fs.existsSync(dirname + "/" + user.tag)) {
                            mkdirp.sync(dirname + "/" + user.tag);
                          }

                          var encoder = new lame.Encoder({
                            channels: 2,
                            bitDepth: 16,
                            sampleRate: 44100,

                            bitRate: 128,
                            outSampleRate: 44100,
                            mode: lame.STEREO,
                          });

                          let audio = conn.receiver.createStream(user, {
                            mode: "pcm",
                          });

                          audio.pipe(encoder);
                          encoder.pipe(
                            fs.createWriteStream(
                              dirname + "/" + user.tag + "/recorded.mp3"
                            )
                          );
                        }

                        if (
                          state.bitfield == 0 &&
                          user &&
                          user.id != that.client.user.id
                        ) {
                          if (silenceTiming.has(user.tag)) {
                            var silenceTime = silenceTiming.get(user.tag);

                            if (silenceTime <= 0) {
                              silenceTime = 0.01;
                            }

                            silenceTiming.set(user.tag, Date.now());
                            //console.log(`${user.tag}:${silenceTime}`);
                            childProcess.exec(
                              "sox -n -r 44100 -c 2 " +
                                dirname +
                                "/" +
                                user.tag +
                                "/silence.mp3 trim 0.0 " +
                                silenceTime,
                              (error, stdout, stderr) => {
                                var silencePath =
                                  dirname + "/" + user.tag + "/silence.mp3";
                                var recordedPath =
                                  dirname + "/" + user.tag + "/recorded.mp3";
                                var outputPath =
                                  dirname + "/" + user.tag + "/output.mp3";

                                var outputPath2 =
                                  dirname + "/" + user.tag + "/output2.mp3";

                                if (!fs.existsSync(outputPath)) {
                                  childProcess.exec(
                                    "sox " +
                                      silencePath +
                                      " " +
                                      recordedPath +
                                      " " +
                                      outputPath,
                                    () => {}
                                  );
                                } else {
                                  fs.copyFile(outputPath, outputPath2, () => {
                                    childProcess.exec(
                                      "sox " +
                                        outputPath2 +
                                        " " +
                                        silencePath +
                                        " " +
                                        recordedPath +
                                        " " +
                                        outputPath,
                                      () => {}
                                    );
                                  });
                                }
                              }
                            );
                          } else {
                            silenceTiming.set(user.tag, Date.now());
                          }
                        }
                      });

                      that.client.on("message", (msg) => {
                        if (msg.channel.id == textChannel.id) {
                          that.chatHistory.push(
                            `${msg.author.tag}: ${msg.content}`
                          );
                          if (
                            msg.content.startsWith(config.prefix + "finish")
                          ) {
                            that.finishGame(
                              dirname,
                              guildChannel,
                              textChannel,
                              category
                            );

                            resolve({
                              token: botToken,
                              dir: dirname,
                              players: that.participantsArr,
                            });

                            guildChannel.members.forEach((member) => {
                              if (member.id != that.client.user.id) {
                                that.connectToVoiceChat(member, null);
                              }
                            });
                          }

                          if (
                            msg.content.startsWith(config.prefix + "restart")
                          ) {
                            that.questionCounter = 0;
                            that.usedNumbers = [];
                            textChannel.send(prompts.restarted);
                            that.askQuestion(textChannel);
                          }

                          if (msg.content.startsWith(config.prefix + "next")) {
                            that.askQuestion(textChannel);
                          }

                          if (
                            msg.content.startsWith(config.prefix + "accept")
                          ) {
                            if (that.participantsArr.size == 4) {
                              textChannel.send(prompts.maxPlayersAlready);
                              return;
                            }
                            let args = msg.content.split(/ (.*)/);

                            if (args.length == 1) {
                              let playersToAccept = that.rawPlayers.join("\n");
                              textChannel.send(
                                `List of players for accept:\n${playersToAccept}`
                              );
                            }

                            if (args.length > 1) {
                              let playerName = args[1];
                              if (that.rawPlayers.includes(playerName)) {
                                that.eventEmitter.emit(playerName, true);
                                that.rawPlayers.splice(
                                  that.rawPlayers.indexOf(playerName),
                                  1
                                );
                              } else {
                                textChannel.send(
                                  prompts.noUserForAccept.replace(
                                    "${player}",
                                    playerName
                                  )
                                );
                              }
                            }
                          }

                          if (
                            msg.content.startsWith(config.prefix + "decline")
                          ) {
                            let args = msg.content.split(/ (.*)/);

                            if (args.length == 1) {
                              let playersToAccept = that.rawPlayers.join("\n");
                              textChannel.send(
                                `List of players for decline:\n${playersToAccept}`
                              );
                            }

                            if (args.length > 1) {
                              let playerName = args[1];
                              if (that.rawPlayers.includes(playerName)) {
                                that.eventEmitter.emit(playerName, false);
                                that.rawPlayers.splice(
                                  that.rawPlayers.indexOf(playerName),
                                  1
                                );
                              } else {
                                textChannel.send(
                                  prompts.noUserForAccept.replace(
                                    "${player}",
                                    playerName
                                  )
                                );
                              }
                            }
                          }
                        }
                      });
                    });
                  });
              });
          });
      }).then((result) => {
        callback(result);
      });
    });
  }

  askQuestion(textChannel) {
    this.questionCounter += 1;

    if (this.questionCounter >= 6) {
      textChannel.send(prompts.canFinish);
    }

    if (this.questionCounter == this.questions.length - 1) {
      textChannel.send(prompts.noMoreQuestions);
      return;
    }

    do {
      this.nextQuestion = this.getRandomInt(0, this.questions.length);
    } while (this.usedNumbers.includes(this.nextQuestion));

    this.usedNumbers.push(this.nextQuestion);

    textChannel.send(
      prompts.question
        .replace("${number}", this.questionCounter)
        .replace("${question}", this.questions[this.nextQuestion])
    );
  }
};
