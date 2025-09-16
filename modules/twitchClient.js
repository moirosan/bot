import tmi from "tmi.js";
import dotenv from "dotenv";

dotenv.config();

const client = new tmi.Client({
  options: { debug: true },
  identity: {
    username: "lbisb_bot",
    password: dimill!moiro1e23ilyas
  },
  channels: process.env.CHANNELS.split(",")
});

const connect = async () => {
  try {
    await client.connect();
    console.log("Connected!");
  } catch (err) {
    console.error("Error: ", err);
    setTimeout(connect, 3000);
  }
};

export { client, connect };
