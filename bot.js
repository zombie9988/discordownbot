var Listener = require("./Workers/listener");

prompts = {
  alreadyInGame: "You are already in a game.",
  whoIsInterested: "Who is interested in playing? Type /startgame to join.",
  noFreeRecorders: "Sorry, there are no free recorders.",
  askRate:
    "You just finished playing. How would you rate your experience: 1 (bad) - 5 (great)?",
  askFeedback: "Do you have any feedback for improving the game experience?",
  finishPlaying: "Thank you for playing!",
  textConnect: "Type /next to display the next question",
  noMoreQuestions:
    "Your game is over! Type /finish or disconnect from the voice channel.",
  restarted: "Game Restarted, type /next",
  playerTurn: "Player ${player} turn",
  question: "Question #${number}: ${question}",
  instructions: "There are 3 steps you’ll need to do in order to start the game:\n 1) click the voice channel on the left to join the audio channel with the other player, \n2) unmute your mic so the other player can hear you, \n3) click the text channel above the voice channel to see the game instructions."
};

process.on("unhandledRejection", ex => {
  console.log("Unhandled promise rejection", ex);
});

process.on("uncaughtException", ex => {
  console.log("Uncaught exception", ex);
});

config = require("./config.json");

var listener = new Listener(config.general_token, config.recorders_tokens);
