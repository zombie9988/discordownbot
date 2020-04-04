const Discord = require("discord.js");
const Recorder = require("./recorder");
const fs = require("fs");

module.exports = class Listener {
  isReadyToStartGame(msg) {
    if (this.alreadyPlay.includes(msg.author.id)) {
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

    if (this.interestedState == 0) {
      msg.channel.send(prompts.whoIsInterested);

      this.interestedState = 1;
      this.firstPlayer = msg.author;
      this.firstMember = msg.member;
      this.alreadyPlay.push(msg.author.id);

      return true;
    } else {
      this.interestedState = 0;
      this.secondPlayer = msg.author;
      this.secondMember = msg.member;
      this.alreadyPlay.push(msg.author.id);

      let recorder = new Recorder();
      recorder.startRecord(
        this.unusedToken.pop(),
        this.firstPlayer.id,
        this.secondPlayer.id,
        this.guildId,
        (inputData) => this.askQuestions(inputData),
        msg.channel
      );
    }
  }

  constructor(botToken, additionalTokens) {
    this.token = botToken;
    this.client = new Discord.Client();
    this.alreadyPlay = [];
    this.unusedToken = additionalTokens;
    this.interestedState = 0;

    this.client.login(this.token);

    this.client.on("ready", () => {
      console.log("Listener ready");
    });

    this.client.on("message", (msg) => {
      if (msg.content.startsWith(config.prefix + "startgame")) {
        this.startGame(msg);
      }
    });
  }

  askUser(player, inputData) {
    var dirname = inputData.dir;
    var waitTime = 60000;

    var member = this.client.guilds
      .resolve(this.guildId)
      .members.resolve(player);

    this.alreadyPlay.splice(this.alreadyPlay.indexOf(player.id), 1);

    var playerRate, playerFeedback;
    member.createDM().then((dmChannel) => {
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
    });
  }

  askQuestions(inputData) {
    //console.log(inputData)
    this.unusedToken.push(inputData.token);

    this.askUser(inputData.firstP, inputData);
    this.askUser(inputData.secondP, inputData);
  }
};
