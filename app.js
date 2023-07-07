const express = require("express");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
app.use(express.json());
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

// verification;
const authentication = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  console.log(tweet);
  console.log(tweetId);
  let jwtToken;
  const authHeaders = request.headers["authorization"];
  if (authHeaders === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwtToken = authHeaders.split(" ")[1];
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        console.log(request.payload);
        request.tweetId = tweetId;
        request.tweet = tweet;
        console.log(request.tweetId);
        console.log(request.tweet);
        next();
      }
    });
  }
};

// API-1
app.post("/register", async (request, response) => {
  const { name, username, password, gender } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  console.log(dbUser);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `INSERT INTO 
                    user (name, username, password, gender)
                    VALUES (
                        '${name}',
                        '${username}',
                        '${hashedPassword}',
                        '${gender}'
                    )`;
      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// API-2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const jwtToken = await jwt.sign(dbUser, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API-3
app.get("/user/tweets/feed/", authentication, async (request, response) => {
  const { payload } = request;
  const { name, username, gender, user_id } = payload;
  const getTweetsFeedQuery = `
        SELECT 
            username,
            tweet,
            date_time AS dateTime
        FROM 
            follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN user ON user.user_id = follower.following_user_id
        WHERE follower.follower_user_id = ${user_id}
       ORDER BY
            date_time DESC
        LIMIT 4;
  `;
  const tweetFeedArray = await db.all(getTweetsFeedQuery);
  response.send(tweetFeedArray);
});

//API-4
app.get("/user/following/", authentication, async (request, response) => {
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  const getUserFollowingNamesQuery = `
            SELECT 
                name
            FROM
                user INNER JOIN follower ON user.user_id = follower.following_user_id
            WHERE 
                follower.follower_user_id=${user_id};
     `;
  const followingUserNamesArray = await db.all(getUserFollowingNamesQuery);
  response.send(followingUserNamesArray);
});

//API-5
app.get("/user/followers/", authentication, async (request, response) => {
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  const getUserFollowersNamesQuery = `
       SELECT 
            name
        from 
            user INNER JOIN follower ON user.user_id = follower.follower_user_id
        WHERE 
            follower.following_user_id = ${user_id}
    `;
  const userFollowersNamesArray = await db.all(getUserFollowersNamesQuery);
  response.send(userFollowersNamesArray);
});

//API-6
app.get("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request.params;
  const { payload } = request;
  const { user_id, username, gender, name } = payload;
  const tweetsQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetsResult = await db.get(tweetsQuery);
  //   response.send(tweetsResult)
  const userFollowersQuery = `
        SELECT 
            * 
        FROM 
            follower INNER JOIN user ON user.user_id = follower.following_user_id
        WHERE 
            follower.follower_user_id = ${user_id};`;
  const userFollowers = await db.all(userFollowersQuery);
  //   response.send(userFollowers);
  if (
    userFollowers.some(
      (item) => item.following_user_id === tweetsResult.user_id
    )
  ) {
    // console.log(tweetsResult);
    // console.log(".........");
    // console.log(userFollowers);
    const tweetResultQuery = `
        SELECT
            tweet,
            COUNT(DISTINCT(like.like_id)) AS likes,
            COUNT(DISTINCT(reply.reply_id)) AS replies,
            tweet.date_time AS dateTime
        FROM
            tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
        WHERE
            tweet.tweet_id = ${tweetId} AND tweet.user_id = ${userFollowers[0].user_id};
    `;
    const tweetDetails = await db.get(tweetResultQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API-7
app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  async (request, response) => {
    const { payload } = request;
    const { username, user_id, gender, name } = payload;
    const { tweetId } = request.params;
    const getLikesUserQuery = `
        SELECT
            *
        FROM
            follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN user on user.user_id = like.user_id
        WHERE tweet.tweet_id = ${tweetId} AND follower.follower_user_id=${user_id};
    `;
    const likedUsers = await db.all(getLikesUserQuery);
    // response.send(likedUsers);
    if (likedUsers.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUsers) => {
        for (let item of likedUsers) {
          likes.push(item.username);
        }
      };
      getNamesArray(likedUsers);
      console.log(likes);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-8
app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  async (request, response) => {
    const { tweetId } = request.params;
    const { payload } = request;
    const { user_id, username, name, gender } = payload;
    const getRepliesUserQuery = `
            SELECT
                *
            FROM
                follower INNER JOIN tweet ON follower.following_user_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id INNER JOIN user ON user.user_id = reply.user_id
            WHERE 
                tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};
    `;
    const repliedUsers = await db.all(getRepliesUserQuery);
    // response.send(repliedUsers);
    if (repliedUsers.length !== 0) {
      let replies = [];
      const getNamesRepliesArray = (repliedUsers) => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNamesRepliesArray(repliedUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-9
app.get("/user/tweets/", authentication, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getUserTweetsQuery = `
                SELECT
                    tweet.tweet AS tweet,
                    COUNT(DISTINCT(like.like_id)) AS likes,
                    COUNT(DISTINCT(reply.reply_id)) AS replies,
                    tweet.date_time AS dateTime
                FROM 
                    user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
                WHERE 
                    user.user_id = ${user_id}
                GROUP BY
                    tweet.tweet_id;`;
  const tweetsDetails = await db.all(getUserTweetsQuery);
  response.send(tweetsDetails);
});

//API-10
app.post("/user/tweets/", authentication, async (request, response) => {
  const { tweet } = request.body;
  const { payload } = request;
  const { tweetId } = request;
  const { user_id, username, name, gender } = payload;
  //   console.log(tweet, user_id);
  const postTweetQuery = `
            INSERT INTO
                    tweet(tweet, user_id)
            VALUES(
                "${tweet}",
                ${user_id}
            )
    `;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

//API-11
app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request.params;
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  const selectUserQuery = `
          SELECT 
            * 
          FROM tweet WHERE tweet.user_id=${user_id} AND tweet.tweet_id = ${tweetId};
    `;
  const tweetUser = await db.all(selectUserQuery);
  //   response.send(tweetUser);
  if (tweetUser.length !== 0) {
    const deleteTweetQuery = `
                DELETE FROM tweet
                WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//export module
module.exports = app;
