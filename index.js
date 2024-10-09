const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const fs = require('fs').promises;

const config = require('./config.json');

const log = (level, message) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${level}: ${message}`);
  fs.appendFile(`bot_log_${new Date().toISOString().split('T')[0]}.log`, `${timestamp} - ${level}: ${message}\n`)
    .catch(err => console.error('Error writing to log file:', err));
};

async function loadSession(phone) {
  try {
    const data = await fs.readFile(`session_${phone}.json`, 'utf8');
    return new StringSession(data);
  } catch (error) {
    return new StringSession('');
  }
}

async function saveSession(session, phone) {
  await fs.writeFile(`session_${phone}.json`, session.save());
}

async function initializeClient(account) {
  const session = await loadSession(account.phone);
  const client = new TelegramClient(session, account.api_id, account.api_hash, { connectionRetries: 5 });

  await client.start({
    phoneNumber: async () => account.phone,
    password: async () => await input.text('Please enter your password: '),
    phoneCode: async () => await input.text('Please enter the code you received: '),
    onError: (err) => console.log(err),
  });

  await saveSession(client.session, account.phone);

  log('INFO', `Client for ${account.phone} is now connected and ready`);

  return client;
}

async function setupChannelHandlers(client, account) {
  for (const channel of account.channels) {
    const entity = await client.getEntity(channel.username);

    client.addEventHandler(async (update) => {
      if (update.className === 'UpdateNewChannelMessage' && update.message.peerId.channelId.toString() === entity.id.toString()) {
        const message = update.message;
        
        if (message.message) {
          log('INFO', `New message in channel ${channel.username}: ${message.message.substring(0, 30)}...`);
          
          try {
            await client.invoke(new Api.messages.SendMessage({
              peer: entity,
              message: channel.comment,
              replyToMsgId: message.id
            }));
            log('INFO', `Comment posted successfully in ${channel.username}`);
          } catch (error) {
            log('ERROR', `Failed to post comment in ${channel.username}: ${error}`);
          }
        }
      }
    });

    log('INFO', `Handler set up for ${channel.username}`);
  }
}

async function main() {
  const clients = [];

  for (const account of config.accounts) {
    try {
      const client = await initializeClient(account);
      await setupChannelHandlers(client, account);
      clients.push(client);
    } catch (error) {
      log('ERROR', `Failed to initialize client for ${account.phone}: ${error}`);
    }
  }

  if (clients.length === 0) {
    log('ERROR', 'No clients were initialized successfully');
    return;
  }

  log('INFO', `Bot is running with ${clients.length} clients`);
  console.log(`Bot is running with ${clients.length} clients. Press Ctrl+C to stop.`);

  // Keep the script running
  await new Promise(() => {});
}

main().catch((err) => {
  log('ERROR', `Fatal error: ${err}`);
  process.exit(1);
});