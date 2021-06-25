const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const convertUserDbObjectToResponseObject = (dbObject) => {
  return {
    userId: dbObject.user_id,
    name: dbObject.name,
    username: dbObject.user_name,
    password: dbObject.password,
    gender: dbObject.gender,
  };
};

const convertFollowerDbObjectToResponseObject = (dbObject) => {
  return {
    followerId: dbObject.follower_id,
    followerUserId: dbObject.follower_user_id,
    followingUserId: dbObject.following_user_id,
  };
};

const convertTweetDbObjectToResponseObject = (dbObject) => {
  return {
    tweetId: dbObject.tweet_id,
    tweet: dbObject.tweet,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  };
};

const convertReplyDbObjectToResponseObject = (dbObject) => {
  return {
    replyId: dbObject.reply_id,
    tweetId: dbObject.tweet_id,
    reply: dbObject.reply,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  };
};

const convertLikeDbObjectToResponseObject = (dbObject) => {
  return {
    likeId: dbObject.like_id,
    tweetId: dbObject.tweet_id,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  };
};

const validatePassword = (password) => {
  return password.length > 5;
};

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    const createUserQuery = `
     INSERT INTO
      user (username, name, password, gender)
     VALUES
      (
       '${username}',
       '${name}',
       '${hashedPassword}',
       '${gender}'
      );`;
    if (validatePassword(password)) {
      await db.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "secretpassword");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secretpassword", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
}

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { limit = 4 } = request.query;
  const getTweetsQuery = `
        SELECT DISTINCT
            username, tweet, date_time
        FROM
            tweet join follower on tweet.user_id = follower.follower_user_id
            join user on follower.follower_user_id = user.user_id
            LIMIT ${limit}
        ;`;
  const tweetsArray = await db.all(getTweetsQuery);
  response.send(tweetsArray);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const getTweetsQuery = `
        SELECT
            name
        FROM
            user 
        ;`;
  const tweetsArray = await db.all(getTweetsQuery);
  response.send(tweetsArray);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const getTweetsQuery = `
        SELECT
            name
        FROM
            user
        ;`;
  const tweetsArray = await db.all(getTweetsQuery);
  response.send(tweetsArray);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const getTweetQuery = `
        SELECT  
            tweet, 
            count(like_id) AS likes,
            count(reply_id) AS replies, 
            date_time 
        FROM tweet JOIN like ON tweet.tweet_id = like.tweet_id JOIN reply ON like.tweet_id = reply.tweet_id
        ;`;
  const getTweet = await db.get(getTweetQuery);
  if (getTweet !== undefined) {
    response.send(getTweet);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetQuery = `
        SELECT  
            DISTINCT username AS likes
        FROM tweet JOIN like ON tweet.user_id = like.user_id JOIN user ON like.user_id = user.user_id
        ;`;
    const getTweet = await db.all(getTweetQuery);
    if (getTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(getTweet);
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getReplyQuery = `
        SELECT  
            name,reply
        FROM tweet JOIN reply ON tweet.user_id = reply.user_id JOIN user ON reply.user_id = user.user_id
        ;`;
    const getTweet = await db.all(getReplyQuery);
    if (getTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(getTweet);
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const getTweetsQuery = `
        SELECT
            tweet,
            count(like_id) AS likes,
            count(reply_id) AS replies,
            date_time
        FROM
            tweet JOIN like ON tweet.tweet_id = like.tweet_id JOIN reply ON like.tweet_id = reply.tweet_id
        GROUP BY
            tweet.user_id
        ;`;
  const tweetsArray = await db.all(getTweetsQuery);
  response.send(tweetsArray);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const tweetDetails = request.body;
  const { tweet } = tweetDetails;
  const addTweetQuery = `
    INSERT INTO
      tweet (tweet)
    VALUES
      (
        '${tweet}'
      );`;

  await db.run(addTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const deleteTweetQuery = `
        DELETE  
        FROM tweet
        WHERE tweet_id = '${tweetId}';`;
    const deleteTweet = await db.run(deleteTweetQuery);
    if (deleteTweet !== undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else if (deleteTweet === undefined) {
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
