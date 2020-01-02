// Initialize dependencies
const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const cors = require('cors')
const mongoose = require('mongoose')

const shortId = require('shortid')
const router = require('express').Router()

// Connect to database
mongoose.connect(process.env.MLAB_URI, {useUnifiedTopology : true, useNewUrlParser : true})

app.use(cors())
app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())
app.use('/api/exercise', router)

// Create schemas for exercises and users
const Schema = mongoose.Schema;

const Exercises = new Schema({
  description: {type: String, required: true}, 
  duration: {type: Number, required: true},
  date: {type: Date, default: Date.now()},
  username: String,
  userId: {type: String, ref: 'Users'}
});

const Users = new Schema({
  username: {type: String, required: true, unique: true}, 
  _id: {type: String, default: shortId.generate}
});

const UserModel = mongoose.model('Users', Users)
const ExerciseModel = mongoose.model('Exercises', Exercises)

app.use(express.static('public'))

// Routes to front page by default
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'})
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})

// Creates a new user via the Users schema (User Story #1)
router.post('/new-user', (req, res, next) => {
  const user = new UserModel(req.body);
  user.save((err, savedUser) => {
    // Returns an error message, with error code available (Setting if/then statements for specific error codes seems to break the program)
    if (err) {
      return res.json({message: "User creation unsuccessful. See error code for details", error_code: err.code})
    }
    // If successful, return username object with user id
    res.json({username: savedUser.username, _id: savedUser._id})
  })
})

// This GET route returns a list of all users with their corresponding ID's by accessing the UserSchema (User Story #2)
router.get('/users', (req,res,next) => {
  UserModel.find({}, (err, data) => {
    res.json(data)
  })
})

// This adds exercises, provided a valid user ID is given (User Story #3)
router.post('/add', (req, res, next) => {
  UserModel.findById(req.body.userId, (err, user) => {
    if (err) {
      return res.json({message: "Could not add exercise. See error code for details", error_code: err.code})
    }
    const exercise = new ExerciseModel(req.body);
    exercise.username = user.username;
    exercise.save((err, addExercise) => {
      if (err) {
        return res.json({message: "Failed to save exercise. See error code for details", error_code: err.code}) 
      }
      addExercise = addExercise.toObject()
      // Don't know why __v property is added, but can be removed instantly
      delete addExercise.__v
      addExercise._id = addExercise.userId
      // avoid duplicating user ID
      delete addExercise.userId
      // Format date
      addExercise.date = (new Date(addExercise.date)).toDateString()
      res.json(addExercise)
    })
  })
})

// The '/log' path allows the user to enter a userId and get a list of all exercises. If they so desire, they can get exercises within a specific time interval 
// (User Stories #3, #4)
router.get('/log', (req, res, next) => {
  const from = new Date(req.query.from)
  const to = new Date(req.query.to)
  UserModel.findById(req.query.userId, (err, user) => {
    if(err) {
      return next(err)
    }
    ExerciseModel.find({
      userId: req.query.userId,
      // For the date interval, default to 1/1/1970 - present if invalid dates are given...
        date: {
          $gt: from != 'Invalid Date' ? from.getTime() : 0,
          $lt: to != 'Invalid Date' ? to.getTime() : Date.now()
        }
      })
    .sort('-date')
     // Enables setting a limit on the number of exercises to display
    .limit(parseInt(req.query.limit))
    .exec((err, exercises) => {
      if(err) {
        return next(err)
      }
      const exerciseLog = {
          _id: req.query.userId,
          username: user.username,
          from : from != 'Invalid Date' ? from.toDateString() : undefined,
          to : to != 'Invalid Date' ? to.toDateString(): undefined,
          count: exercises.length,
          log: exercises.map(e => ({
            description : e.description,
            duration : e.duration,
            date: e.date.toDateString()
          })
        )
      }
      res.json(exerciseLog)
    })
  })
})

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})