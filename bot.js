var Listener = require('./Workers/listener')

prompts = {
  alreadyInGame: 'You already in game',
  whoIsInterested: 'Who is interested?',
  noFreeRecorders: 'Sorry, no free recorders',
  askRate:
    'You just finished playing. How would you rate your experience: 1 (bad) - 5 (great)?',
  askFeedback: 'Do you have any feedback (optional):',
  finishPlaying: 'Thank you for playing',
  textConnect: 'Greetings! Type /next to start',
  noMoreQuestions: 'Game is over! Type /finish or exit from voice channel'
}

process.on('unhandledRejection', ex => {
  console.log('Unhandled promise rejection', ex)
})

process.on('uncaughtException', ex => {
  console.log('Uncaught exception', ex)
})

config = require('./config.json')

var listener = new Listener(config.general_token, config.recorders_tokens)