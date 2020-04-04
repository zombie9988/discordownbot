const Discord = require("discord.js");
const fs = require("fs");
const lame = require("lame");
const mkdirp = require("mkdirp");
const childProcess = require("child_process");
const { Readable } = require("stream");

class Silence extends Readable {
  _read() {
    this.push(Buffer.from([0xf8, 0xff, 0xfe]));
  }
}

module.exports = class Recorder {
  constructor() {}

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

    if (fs.existsSync(dirnamePlayer + "/output.wav")) {
      this.wavDirs.push(dirnamePlayer + "/output.wav");
    } else {
      console.log("No audio for " + player.tag);
    }
  }

  finishGame(
    firstPlayer,
    secondPlayer,
    dirname,
    guildChannel,
    textChannel,
    category
  ) {
    this.wavDirs = [];
    var that = this;
    this.recordedVoices.forEach((user) => {
      that.saveResults(user, dirname);
    });
    var allText = " ";
    that.chatHistory.forEach((value, index, array) => {
      allText += `${value} \n -------------------------------------------------------------------------------------\n`;
    });
    //this.saveResults(firstPlayer, dirname)
    //this.saveResults(secondPlayer, dirname)

    fs.writeFileSync(`${dirname}/chat.txt`, allText);
    if (this.wavDirs.length > 1) {
      childProcess.execSync(
        "sox -m " + this.wavDirs.join(" ") + " " + dirname + "/output.wav"
      );
    }
    guildChannel.delete();
    textChannel.delete();
    category.delete();
    this.client.destroy();

    //console.log(botToken)
  }

  startRecord(
    botToken,
    firstPlayerID,
    secondPlayerID,
    guildId,
    callback,
    outTextChannel
  ) {
    this.client = new Discord.Client();

    this.token = botToken;
    this.guildId = guildId;
    this.client.login(this.token);
    this.questions = fs.readFileSync("questions.txt").toString().split("\r\n");
    var that = this;

    this.client.on("ready", () => {
      console.log("Recorder ready");

      that.firstPlayer = that.client.users.resolve(firstPlayerID);
      that.firstMember = that.client.guilds
        .resolve(that.guildId)
        .members.resolve(that.firstPlayer);

      that.secondPlayer = that.client.users.resolve(secondPlayerID);
      that.secondMember = that.client.guilds
        .resolve(that.guildId)
        .members.resolve(that.secondPlayer);

      new Promise(function (resolve, reject) {
        //console.log(that)
        var localGuild = that.firstMember.guild;
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
                var startTime = Date.now();
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
                    textChannel.setParent(category);
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

                      var dirnameFirstPlayer =
                        dirname + "/" + that.firstPlayer.tag;
                      var dirnameSecondPlayer =
                        dirname + "/" + that.secondPlayer.tag;

                      mkdirp.sync(dirname);
                      mkdirp.sync(dirnameFirstPlayer);
                      mkdirp.sync(dirnameSecondPlayer);
                      that.recordedVoices = [];
                      that.connectToVoiceChat(that.firstMember, guildChannel);
                      that.connectToVoiceChat(that.secondMember, guildChannel);

                      outTextChannel.send(prompts.instructions);
                      that.questionCounter = 0;
                      that.usedNumbers = [];

                      that.firstInGame = that.firstPlayer;
                      that.secondInGame = that.secondPlayer;
                      that.nextPlayer = that.secondInGame;

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

                          if (
                            oldState.member.id == that.firstPlayer ||
                            oldState.member.id == that.secondPlayer
                          ) {
                            if (
                              oldState.channelID == guildChannel.id &&
                              newState.channelID != guildChannel.id &&
                              !(
                                guildChannel.members.find(
                                  (u) => u.id == that.firstMember.id
                                ) ||
                                guildChannel.members.find(
                                  (u) => u.id == that.secondMember.id
                                )
                              )
                            ) {
                              that.finishGame(
                                that.firstPlayer,
                                that.secondPlayer,
                                dirname,
                                guildChannel,
                                textChannel,
                                category
                              );

                              resolve({
                                token: botToken,
                                dir: dirname,
                                firstP: that.firstPlayer,
                                secondP: that.secondPlayer,
                                firstM: that.firstMember,
                                secondM: that.secondMember,
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
                            childProcess
                              .execSync(
                                "sox -n -r 44100 -c 2 " +
                                  dirname +
                                  "/" +
                                  user.tag +
                                  "/silence.wav trim 0.0 " +
                                  silenceTime
                              )
                              .toString();
                            var silencePath =
                              dirname + "/" + user.tag + "/silence.wav";
                            var recordedPath =
                              dirname + "/" + user.tag + "/recorded.mp3";
                            var outputPath =
                              dirname + "/" + user.tag + "/output.wav";

                            var outputPath2 =
                              dirname + "/" + user.tag + "/output2.wav";

                            if (!fs.existsSync(outputPath)) {
                              childProcess
                                .execSync(
                                  "sox " +
                                    silencePath +
                                    " " +
                                    recordedPath +
                                    " " +
                                    outputPath
                                )
                                .toString();
                            } else {
                              fs.copyFileSync(outputPath, outputPath2);
                              childProcess
                                .execSync(
                                  "sox " +
                                    outputPath2 +
                                    " " +
                                    silencePath +
                                    " " +
                                    recordedPath +
                                    " " +
                                    outputPath
                                )
                                .toString();
                            }
                          }

                          silenceTiming.set(user.tag, Date.now());
                        }
                      });

                      that.client.on("message", (msg) => {
                        that.chatHistory.push(
                          `${msg.author.tag}: ${msg.content}`
                        );

                        if (
                          msg.content.startsWith(config.prefix + "finish") &&
                          msg.channel.id == textChannel.id
                        ) {
                          that.connectToVoiceChat(that.firstMember, null);
                          that.connectToVoiceChat(that.secondMember, null);
                        }

                        if (
                          msg.content.startsWith(config.prefix + "restart") &&
                          msg.channel.id == textChannel.id
                        ) {
                          that.questionCounter = 0;
                          that.usedNumbers = [];
                          textChannel.send(prompts.restarted);
                          that.firstInGame = that.firstPlayer;
                          that.secondInGame = that.secondPlayer;
                          that.nextPlayer = that.secondInGame;
                          that.askQuestion(textChannel);
                        }

                        if (
                          msg.content.startsWith(config.prefix + "next") &&
                          msg.channel.id == textChannel.id &&
                          that.nextPlayer.id == msg.author.id
                        ) {
                          that.askQuestion(textChannel);
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
    if (this.nextPlayer.id != this.firstInGame.id) {
      this.nextPlayer = this.firstInGame;
      this.questionCounter += 1;

      do {
        this.nextQuestion = this.getRandomInt(0, this.questions.length);
      } while (this.usedNumbers.includes(this.nextQuestion));
    } else {
      this.nextPlayer = this.secondInGame;
    }

    if (this.questionCounter == 6) {
      textChannel.send(prompts.noMoreQuestions);
      return;
    }

    this.usedNumbers.push(this.nextQuestion);

    textChannel.send(
      prompts.playerTurn.replace("${player}", this.nextPlayer.tag)
    );
    textChannel.send(
      prompts.question
        .replace("${number}", this.questionCounter)
        .replace("${question}", this.questions[this.nextQuestion])
    );
  }
};
