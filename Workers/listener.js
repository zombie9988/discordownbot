const Discord = require("discord.js");
const Recorder = require("./recorder");
const fs = require("fs");

module.exports = class Listener {
  isReadyToStartGame(msg) {
    if (this.alreadyPlay.has(msg.author.tag.slice(0, -5))) {
      msg.channel.send(prompts.alreadyInGame);
      return false;
    }

    if (this.unusedToken.length == 0) {
      msg.channel.send(prompts.noFreeRecorders);
      return false;
    }

    try {
      this.guildId = msg.guild.id;
    } catch (error) {
      console.log("/startgame was sent to DM");
      return false;
    }

    return true;
  }

  startGame(msg) {
    if (!this.isReadyToStartGame(msg)) {
      return false;
    }

    var recorder = new Recorder(this.guildId, msg.channel);

    this.alreadyPlay.set(msg.author.tag.slice(0, -5).toLowerCase(), recorder);
    this.gamesToStart.push(msg.author.tag.slice(0, -5).toLowerCase());
    recorder.addParticipant(msg.author, this);
    this.waitingRooms.push(msg.author.tag.slice(0, -5).toLowerCase());
    msg.channel.send(
      prompts.toJoinChannel.replace(
        /\$\{player\}/g,
        msg.author.tag.slice(0, -5)
      )
    );
  }

  joinGame(msg, target) {
    let recorder = this.alreadyPlay.get(target.toLowerCase());

    var result = recorder.addParticipant(msg.author, this);

    if (result == 1) {
      this.waitingRooms.splice(
        this.waitingRooms.indexOf(target.toLowerCase()),
        1
      );
      this.launchedRoom.set(target.toLowerCase(), 2);
      recorder.startRecord(
        this.unusedToken.pop(),
        (inputData) => this.askQuestions(inputData),
        this
      );
    }
  }

  constructor(botToken, additionalTokens) {
    this.token = botToken;
    this.gamesToStart = [];
    this.client = new Discord.Client();
    this.alreadyPlay = new Map();
    this.unusedToken = additionalTokens;
    this.interestedState = 0;
    this.waitingRooms = [];
    this.launchedRoom = new Map();
    this.client.login(this.token);

    this.client.on("ready", () => {
      console.log("Listener ready");
    });

    this.client.on("message", (msg) => {
      if (msg.content.startsWith(config.prefix + "startgame")) {
        this.startGame(msg);
      }

      if (msg.content.startsWith(config.prefix + "cancel")) {
        let playerName = msg.author.tag.slice(0, -5).toLowerCase();
        if (this.gamesToStart.includes(playerName)) {
          let recorder = this.alreadyPlay.get(playerName);

          if (recorder.hasStarted()) {
            msg.channel.send(prompts.needToFinish);
          } else {
            this.gamesToStart.splice(this.gamesToStart.indexOf(playerName, 1));
            this.alreadyPlay.delete(playerName);
            this.waitingRooms.splice(this.waitingRooms.indexOf(playerName, 1));
            msg.channel.send(
              prompts.gameRemoved.replace("${player}", playerName)
            );
          }
        } else {
          msg.channel.send(prompts.notInGame);
        }
      }

      if (msg.content.startsWith(config.prefix + "list")) {
        let resStr = "";

        this.waitingRooms.forEach((value) => {
          resStr += `+ ${value} 1/4\n`;
        });
        this.launchedRoom.forEach((value, key) => {
          if (value == 4) {
            resStr += `- ${key} ${value}/4\n`;
          } else {
            resStr += `+ ${key} ${value}/4\n`;
          }
        });
        if (resStr == "") {
          msg.channel.send("```No rooms\n\n```");
        } else {
          msg.channel.send("```diff\n" + resStr + "\n```");
        }
      }

      if (msg.content.startsWith(config.prefix + "joingame")) {
        if (this.alreadyPlay.has(msg.author.tag.slice(0, -5).toLowerCase())) {
          if (
            this.gamesToStart.includes(
              msg.author.tag.slice(0, -5).toLowerCase()
            )
          ) {
            var playerName = msg.author.tag.slice(0, -5).toLowerCase();
            this.gamesToStart.splice(this.gamesToStart.indexOf(playerName, 1));
            this.alreadyPlay.delete(playerName);
            this.waitingRooms.splice(this.waitingRooms.indexOf(playerName, 1));
            msg.channel.send(
              prompts.gameRemoved.replace("${player}", playerName)
            );
          } else {
            msg.channel.send(prompts.alreadyInGame);
            return;
          }
        }

        try {
          let guildId = msg.guild.id;
        } catch (error) {
          console.log("/startgame was sent to DM");
          return;
        }

        var args = msg.content.split(/ (.*)/);
        if (args.length < 2) {
          msg.channel.send(prompts.toJoinChannel);
          return;
        }

        var playerName = args[1];

        if (this.alreadyPlay.has(playerName.toLowerCase())) {
          let recorder = this.alreadyPlay.get(playerName.toLowerCase());
          if (!recorder.hasStarted() && this.unusedToken.length == 0) {
            msg.channel.send(prompts.noFreeRecorders);
            return;
          }
          this.joinGame(msg, playerName);
        } else {
          msg.channel.send(prompts.noRoom.replace("${player}", playerName));
        }
      }
    });
  }

  askUser(player, inputData) {
    var dirname = inputData.dir;
    var waitTime = 300000;

    var member = this.client.guilds
      .resolve(this.guildId)
      .members.resolve(player);

    this.alreadyPlay.delete(player.tag.slice(0, -5).toLowerCase());

    var playerRate, playerFeedback;
    member
      .createDM()
      .then((dmChannel) => {
        dmChannel.send(prompts.askRate).then((msg) => {
          const filter = (msg) => {
            if (Number(msg.content)) {
              if (1 <= Number(msg.content) <= 5) {
                playerRate = msg.content;
                return true;
              } else {
                return false;
              }
            } else {
              return false;
            }
          };
          dmChannel
            .awaitMessages(filter, {
              max: 1,
              time: waitTime,
              errors: ["time"],
            })
            .then((collected) =>
              dmChannel.send(prompts.askFeedback).then((msg) => {
                const filter = (msg) => {
                  playerFeedback = msg.content;
                  return true;
                };
                dmChannel
                  .awaitMessages(filter, {
                    max: 1,
                    time: waitTime,
                    errors: ["time"],
                  })
                  .finally(() => {
                    dmChannel.send(prompts.finishPlaying);

                    fs.appendFileSync(
                      dirname + "/feedback.csv",
                      `${player.tag},${playerRate},${playerFeedback}\n`
                    );
                  });
              })
            )
            .catch((collected) => {
              dmChannel.send(prompts.finishPlaying);
            });
        });
      })
      .catch(console.log("Unable so send DM to " + player.tag));
  }

  askQuestions(inputData) {
    //console.log(inputData)
    this.unusedToken.push(inputData.token);
    let roomName = inputData.players
      .keys()
      .next()
      .value.slice(0, -5)
      .toLowerCase();
    this.launchedRoom.delete(roomName);
    inputData.players.forEach((value, key, index) => {
      this.askUser(value.player, inputData);
    });
  }
};
