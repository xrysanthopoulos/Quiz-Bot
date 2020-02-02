const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const axios = require('axios');
const MongoClient = require('mongodb').MongoClient;

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const PORT = process.env.PORT;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME;

const questCount = 10;
const points = 5;

const app = express().use(bodyParser.json());

app.set("port", PORT || 8000);

app.get('/setup', async function (req, res) {
    await setupGetStartedButton(res);
    await setupPersistentMenu(res);
    await setupGreetingText(res);
});

/// Set up Messenger settings for "Persistent Menu", "Greeting Text", "Get Started Button".

async function setupPersistentMenu(res) {
    var messageData =
    {
        "persistent_menu": [{
            "locale": "default",
            "composer_input_disabled": true,
            "call_to_actions": [
                {
                    "title": 'Νέο παιχνίδι 🎮',
                    "type": "postback",
                    "payload": "start"
                },
                {
                    "type": "postback",
                    "title": "Βγες από το παιχνίδι ❌",
                    "payload": "cancel"
                },
                {
                    "type": "postback",
                    "title": "Γενική βαθμολογία και score 🏆",
                    "payload": "score"
                }
            ]
        }
        ]
    };
    // Start the request
    await request({
        url: "https://graph.facebook.com/v5.0/me/messenger_profile?access_token=" + PAGE_ACCESS_TOKEN,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        form: messageData
    },
        function (error, response, body) {
            if (!error && response.statusCode === 200) {
                // Print out the response body
                res.send(body);

            } else {
                // TODO: Handle errors
                res.send(body);
            }
        });

}

async function setupGreetingText(res) {
    var messageData = {
        "greeting": [
            {
                "locale": "default",
                "text": "Hello {{user_full_name}} 👋 !! This is the Quiz Bot, a trivia game. Press 'Get Started' to start the game."
            }
        ]
    };
    await request({
        url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token=' + PAGE_ACCESS_TOKEN,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        form: messageData
    },
        function (error, response, body) {
            if (!error && response.statusCode === 200) {
                // Print out the response body
                res.send(body);

            } else {
                // TODO: Handle errors
                res.send(body);
            }
        });

}

async function setupGetStartedButton(res) {
    var messageData = {
        "get_started": {
            "payload": "getstarted"
        }
    };
    // Start the request
    await request({
        url: "https://graph.facebook.com/v2.6/me/messenger_profile?access_token=" + PAGE_ACCESS_TOKEN,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        form: messageData
    },
        function (error, response, body) {
            if (!error && response.statusCode === 200) {
                // Print out the response body
                res.send(body);

            } else {
                // TODO: Handle errors
                res.send(body);
            }
        });
}

/// Database actions

// Set random with query questions in user collection in "moreCategoryQuestion" field.
async function setQuestionsUserDB(psid) {
    const client = new MongoClient(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const colQuest = db.collection('questions');

        const colUser = db.collection('users');
        let userFind = { user: psid };
        let dataUser = await colUser.findOne(userFind);
        let query;
        let dataQuest;
        // in case random difficult/category make random query
        if (dataUser.difficult === "random" && dataUser.category === "random") {
            dataQuest = await colQuest.aggregate([{ $sample: { size: 10 } }]).toArray();
        } else {
            // make query from User details
            if (dataUser.difficult === "random") {
                query = { category: dataUser.category }
            } else if (dataUser.category === "random") {
                query = { difficulty: dataUser.difficult }
            } else {
                query = { difficulty: dataUser.difficult, category: dataUser.category }
            }
            dataQuest = await colQuest.aggregate([{ $match: query }, { $sample: { size: 10 } }]).toArray();
        }

        if (dataUser.pastQuestions.length === 0) {
            let updateValues = { $set: { moreCategoryQuestion: dataQuest } };
            await colUser.findOneAndUpdate(userFind, updateValues);
        } else if (dataUser.moreCategoryQuestion.length === 0) {
            let updateValues = { $set: { moreCategoryQuestion: dataQuest, pastQuestions: [] } };
            await colUser.findOneAndUpdate(userFind, updateValues);
        }

    } catch (err) {
        console.log(err.stack);
    }
    client.close();
};

// Get data user from DB and return question for each question counter.
async function getQuestioFromUserDB(psid, id) {
    const client = new MongoClient(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const colUser = db.collection('users');
        let userFind = { user: psid };
        let dataUser = await colUser.find(userFind).toArray();
        
        let currentQuestion = dataUser[0].moreCategoryQuestion[dataUser[0].questCount]
        let updateValues = { $set: { currentQuestion: currentQuestion.id, questCount: dataUser[0].questCount + 1, correctAnswer: currentQuestion.correct_answer } };
        await colUser.findOneAndUpdate(userFind, updateValues);

        return currentQuestion

    } catch (err) {
        console.log(err.stack);
    }
    client.close();
};

// Set past question in user collections *** not use currently
async function setPastQuestionUserDB(psid, id) {
    const client = new MongoClient(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const colUser = db.collection('users');
        let userFind = { user: psid };
        let updateValues = { $push: { pastQuestions: id } };
        await colUser.findOneAndUpdate(userFind, updateValues);

    } catch (err) {
        console.log(err.stack);
    }
    client.close();
};

// Initialize a new User in DB
async function addNewUserDB(psid) {
    const client = new MongoClient(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const col = db.collection('users');

        const getPersonDetails = async () => {
            return axios.get("https://graph.facebook.com/" + psid + "?fields=first_name,last_name,profile_pic&access_token=" + PAGE_ACCESS_TOKEN)
                .then((response) => {
                    return response.data;
                })
                .catch((error) => {
                    console.log(error);
                });
        }
        let data = await getPersonDetails()

        let userFind = { user: psid };
        let user = { user: psid, personalDetails: [data], difficult: null, category: null, points: 0, score: 0, questCount: 0, pastQuestions: [], currentQuestion: [], moreCategoryQuestion: [], correctAnswer: null };

        data = await col.findOne(userFind).then(result => {
            if (result === null || result === undefined) {
                col.insertOne(user);
            }
        })

    } catch (err) {
        console.log(err.stack);
    }
    client.close();
}

//Get data User from DB
async function getUserDataDB(psid) {
    const client = new MongoClient(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const colUser = db.collection('users');

        let userFind = { user: psid };

        let data = await colUser.findOne(userFind);
        return data

    } catch (err) {
        console.log(err.stack);
    }
    client.close();
}

// Update User details difficult/category.
async function updateUserDetailsDB(psid, payload) {
    const client = new MongoClient(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const colUser = db.collection('users');

        let userFind = { user: psid };
        let updateValues;

        let data = await colUser.findOne(userFind);
        if (data.difficult === null) {
            updateValues = { $set: { difficult: payload } };
            await colUser.findOneAndUpdate(userFind, updateValues);
            return false
        } else if (data.category === null) {
            updateValues = { $set: { category: payload } };
            await colUser.findOneAndUpdate(userFind, updateValues);
            return true
        }

        data = await colUser.findOne(userFind);

    } catch (err) {
        console.log(err.stack);
    }
    client.close();
}

// Update User score in DB.
async function updateUserScoreDB(psid) {
    const client = new MongoClient(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const colUser = db.collection('users');

        let userFind = { user: psid };

        let data = await colUser.findOne(userFind);
        let updateValues = { $set: { score: data.score + 1, points: data.points + points } };

        await colUser.findOneAndUpdate(userFind, updateValues);

    } catch (err) {
        console.log(err.stack);
    }
    client.close();
}
// Initialize User fields in DB to start new round.
async function startNewRoundUserDB(psid) {
    const client = new MongoClient(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const colUser = db.collection('users');

        let userFind = { user: psid };

        let updateValues = { $set: { difficult: null, category: null, score: 0, questCount: 0, pastQuestions: [], currentQuestion: [], moreCategoryQuestion: [], correctAnswer: null } };

        await colUser.findOneAndUpdate(userFind, updateValues);

    } catch (err) {
        console.log(err.stack);
    }
    client.close();
}

/// Facebook Messenger webhook 

app.get('/webhook', (req, res) => {

    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    // Checks if a token and mode is in the query string of the request
    if (mode && token) {
        // Checks the mode and token sent is correct
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {

            // Responds with the challenge token from the request
            console.log('WEBHOOK_VERIFIED');
            // await getQuestionsForDB();
            res.status(200).send(challenge);
        } else {
            // Responds with '403 Forbidden' if verify tokens do not match
            res.sendStatus(403);
        }
    }
});

app.post('/webhook', (req, res) => {

    // Parse the request body from the POST
    let body = req.body;

    // Check the webhook event is from a Page subscription
    if (body.object === 'page') {

        body.entry.forEach(function (entry) {
            // Gets the body of the webhook event
            let webhook_event = entry.messaging[0];
            // console.log(webhook_event);

            // Get the sender PSID
            let sender_psid = webhook_event.sender.id;

            // Check if the event is a message or postback and
            // pass the event to the appropriate handler function
            if (webhook_event.message) {
                handleMessage(sender_psid, webhook_event.message);
            } else if (webhook_event.postback) {
                handlePostback(sender_psid, webhook_event.postback);
            }
        });

        // Return a '200 OK' response to all events
        res.status(200).send('EVENT_RECEIVED');

    } else {
        // Return a '404 Not Found' if event is not from a page subscription
        res.sendStatus(404);
    }

});

/// Display functions

const wellcomeGetStart = () => {
    const msg = {
        "text": `Γεια 👋\nΤο Quiz bot είναι ένα trivial game, δοκίμασε τις γνώσεις σου σε διαφορετικές κατηγορίες και επίπεδο δυσκολίας και με κάθε σωστή απάντηση αύξησε τη βαθμολογία σου.`
    }
    return msg
}

// const wellcomeGetStart = () => {
//     const msg = {
//         "attachment": {
//             "type": "template",
//             "payload": {
//                 "template_type": "button",
//                 "text": `Γεια 👋\nΤο Quiz bot είναι ένα trivial game, δοκίμασε τις γνώσεις σου σε διαφορετικές κατηγορίες και επίπεδο δυσκολίας και με κάθε σωστή απάντηση και αύξησε τη βαθμολογία σου.`,
//                 "buttons": [
//                     {
//                         "type": "postback",
//                         "payload": "start",
//                         "title": "Πάμε"
//                     }
//                 ]
//             }
//         }
//     }
//     return msg
// }

const tipsForGame = () => {
    const msg = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "button",
                "text": `Έχεις ${questCount} ερωτήσεις.\nΜε κάθε σωστή απάντηση κερδίζεις 1 πόντο και ${points} στη Γενική Βαθμολογία.\n\nΧρησιμοποίησε το Menu κάτω αριστερά για να "Ξεκινήσεις" ή να "Σταματήσεις" το παιχνίδι και να δεις την βαθμολογία σου`,
                "buttons": [
                    {
                        "type": "postback",
                        "payload": "start",
                        "title": "Πάμε"
                    }
                ]
            }
        }
    }
    return msg
}

const displayStartGame = () => {
    const msg = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "button",
                "text": "Ξεκίνα να παίζεις 🎮",
                "buttons": [
                    {
                        "type": "postback",
                        "payload": "start",
                        "title": "Ναι"
                    },
                    {
                        "type": "postback",
                        "payload": "no",
                        "title": "Οχι"
                    }
                ]
            }
        }
    }
    return msg
}

const chooseDifficult = () => {
    const msg = {
        "text": "Διάλεξε επίπεδο:",
        "quick_replies": [
            {
                "title": "Τυχαίο",
                "content_type": "text",
                "payload": "random"
            },
            {
                "title": "Εύκολο",
                "content_type": "text",
                "payload": "easy"
            },
            {
                "title": "Μέτριο",
                "content_type": "text",
                "payload": "medium"
            },
            {
                "title": "Δύσκολο",
                "content_type": "text",
                "payload": "hard"
            }
        ]
    }
    return msg
}

const chooseCategory = () => {
    let msg = {
        "text": "Διάλεξε κατηγορία:",
        "quick_replies": [
            {
                "title": "Τυχαίο",
                "content_type": "text",
                "payload": "random"
            },
            {
                "title": "Αθλητισμός",
                "content_type": "text",
                "payload": "sports"
            },
            {
                "title": "Ιστορία",
                "content_type": "text",
                "payload": "history"
            },
            {
                "title": "Γεωγραφία",
                "content_type": "text",
                "payload": "geography"
            },
            {
                "title": "Πολιτισμός",
                "content_type": "text",
                "payload": "culture"
            },
            {
                "title": "Περιβάλλον",
                "content_type": "text",
                "payload": "environment"
            },
            {
                "title": "Επιστήμη",
                "content_type": "text",
                "payload": "science"
            },
            {
                "title": "Γλώσσες",
                "content_type": "text",
                "payload": "language"
            }
        ]
    }

    return msg
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

const scoreDisplay = async (psid) => {
    let data = await getUserDataDB(psid);
    let msg = {
        "text": `Σκορ: ${data.score}\nΓενικοί πόντοι: ${data.points}`
    }
    return msg
}

const correctAsnwerDisplay = async (psid) => {
    let data = await getUserDataDB(psid);
    let msg = {
        "text": `Σωστό! ✅\nΣκορ: ${data.score} ${data.score === 1 ? 'πόντος' : 'πόντοι'} σε ${data.questCount} ${data.questCount === 1 ? 'ερώτηση' : 'ερωτήσεις'}`
    }
    return msg
}

const incorrectAnswersDisplay = () => {
    let msg = {
        "text": "Χμμ.. λάθος απάντηση."
    }
    return msg
}

const unknowAnswersDisplay = () => {
    let msg = {
        "text": "Δεν το γνωρίζω αυτο.."
    }
    return msg
}

const getAnswers = (category, incorrectAnswers, correctAnswer) => {
    let answers = [];
    answers = incorrectAnswers.split("|");
    answers.push(correctAnswer)
    shuffleArray(answers);
    let buttons = answers.map((answer) => {
        return {
            "type": "postback",
            "payload": category,
            "title": answer
        }
    })

    return buttons
}

const displayQuestions = async (psid) => {
    data = await getQuestioFromUserDB(psid);

    const msg = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "button",
                "text": data.question,
                "buttons": getAnswers(data.category, data.incorrect_answers, data.correct_answer)
            }
        }
    }

    return msg
}

const displayQuestionWithImage = () => {
    const msg = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [
                    {
                        "title": data.question,
                        "image_url": data.image,
                        "buttons": getAnswers(data.category, data.incorrect_answers, data.correct_answer)
                    }
                ]
            }
        }
    }

    return msg
}

const startNewRound = async (sender_psid) => {
    await startNewRoundUserDB(sender_psid);
    let response = await chooseDifficult();
    await callSendAPI(sender_psid, response);
}

const stopRound = async (sender_psid) => {
    await startNewRoundUserDB(sender_psid);
    let response = displayStartGame();
    await callSendAPI(sender_psid, response);
}

const displayFinalScore = async (psid) => {
    let data = await getUserDataDB(psid);
    let msg = {
        "text": `Τέλος γύρου!\nΣκορ: ${data.score}`
    }
    return msg
}

const displayExit = async () => {
    let msg = {
        "text": `Τα λέμε την επόμενη φορά! 👋`
    }
    return msg
}

async function handleMessage(sender_psid, received_message) {
    let response;

    // if (received_message.text || received_message.attachments) {
    //     response = await unknowAnswersDisplay();
    //     await callSendAPI(sender_psid, response);
    // }
    if (received_message.text === "score") {
        response = await scoreDisplay(sender_psid);
        await callSendAPI(sender_psid, response);
    }

    if (received_message.quick_reply != undefined) {
        let payload = received_message.quick_reply.payload;

        let status = await updateUserDetailsDB(sender_psid, payload);
        await setQuestionsUserDB(sender_psid);

        if (!status) {
            response = await chooseCategory();
            await callSendAPI(sender_psid, response);
        } else if (status) {
            response = await displayQuestions(sender_psid);
            await callSendAPI(sender_psid, response);
        }
    }
}

const chechAnswer = async (sender_psid, userAnswer, correctAnswer, id) => {
    let response;
    if (userAnswer === correctAnswer) {
        await updateUserScoreDB(sender_psid);
        // await setPastQuestionUserDB(sender_psid, id);
        response = await correctAsnwerDisplay(sender_psid);
    } else if (userAnswer != correctAnswer) {
        response = incorrectAnswersDisplay();
    }
    await callSendAPI(sender_psid, response);
}

async function handlePostback(sender_psid, received_postback) {
    let response;
    let payload = received_postback.payload;

    if (received_postback.payload) {
        switch (payload) {
            case 'getstarted':
                response = await wellcomeGetStart();
                await callSendAPI(sender_psid, response);
                response = await tipsForGame();
                break;
            case 'start':
                await addNewUserDB(sender_psid);
                response = await startNewRound(sender_psid);
                break;
            case 'cancel':
                await stopRound(sender_psid);
                break;
            case 'no':
                response = await displayExit();
                break;
            case 'score':
                response = await scoreDisplay(sender_psid);
                await callSendAPI(sender_psid, response);
                break;
        }
    }

    let data = await getUserDataDB(sender_psid);

    if (payload != "score") {
        if (data != null) {
            if (data.currentQuestion.length != 0) {
                await chechAnswer(sender_psid, received_postback.title, data.correctAnswer, data.currentQuestion);
                if (data.questCount != questCount) {
                    response = await displayQuestions(sender_psid);
                } else {
                    response = await displayFinalScore(sender_psid);
                }
            }
        }
        await callSendAPI(sender_psid, response);

        if (data.questCount === questCount) {
            response = stopRound(sender_psid);
            await callSendAPI(sender_psid, response);
        }
    }
}

async function callSendAPI(sender_psid, response) {
    let typing = {
        "recipient": { "id": sender_psid },
        "sender_action": "typing_on",
    }

    await request({
        "uri": "https://graph.facebook.com/v3.3/me/messages",
        "qs": { "access_token": PAGE_ACCESS_TOKEN },
        "method": "POST",
        "json": typing
    }, (err, res, body) => {
        if (!err) {
            // console.log('message sent!')
        } else {
            console.error("Unable to send message:" + err);
        }
    });

    let request_body = {
        "recipient": { "id": sender_psid },
        "message": response
    }

    await request({
        "uri": "https://graph.facebook.com/v3.3/me/messages",
        "qs": { "access_token": PAGE_ACCESS_TOKEN },
        "method": "POST",
        "json": request_body
    }, (err, res, body) => {
        if (!err) {
            // console.log('message sent!')
        } else {
            console.error("Unable to send message:" + err);
        }
    });
}

app.listen(app.get("port"), () => {
    // console.log(`Find the server at: http://localhost:${app.get("port")}/`); // eslint-disable-line no-console
});
