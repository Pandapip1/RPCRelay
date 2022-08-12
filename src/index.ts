#!/usr/bin/env node
import express from 'express';
import axios from 'axios';
import https from 'https';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import inquirer from 'inquirer';
import boxen from 'boxen';
import chalk from 'chalk';

import * as fsP from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';

import _ from 'lodash';

import defaultConfig from './default-config.js';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});
axios.defaults.httpsAgent = httpsAgent;

const argv = await yargs(hideBin(process.argv))
  .command(
    'run',
    'Run RPCRelay'
  )
  .command(
    'config',
    'Modify config file'
  )
  .demandCommand(1)
  .argv;

const appDataFile = `${process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share')}/rpcrelay/config.json`;

if (!fs.existsSync(appDataFile)) {
  if (!fs.existsSync(path.dirname(appDataFile))) {
    await fsP.mkdir(path.dirname(appDataFile));
  }
  await fsP.writeFile(appDataFile, JSON.stringify({}, null, 2));
}
const appData = _.merge(JSON.parse(await fsP.readFile(appDataFile, 'utf8')), defaultConfig);
await fsP.writeFile(appDataFile, JSON.stringify(appData, null, 2));

switch (argv._[0]) {
  case 'run':
    const app = express();

    app.use(express.json());

    app.all('/:chainId/*', async (req: express.Request, res: express.Response) => {
      const chainId = req.params.chainId;
      const path = req.path.replace(`/${chainId}`, '');
      if (!appData.chains.find((c: any) => c.chainId == chainId)) {
        res.status(404).send({
          message: 'Chain not found'
        });
        return;
      }
      if (!appData.chains.find((c: any) => c.chainId == chainId)?.rpc) {
        res.status(404).send({
          message: 'No valid RPCs found'
        });
        return;
      }
      const rpc = appData.chains.find((c: any) => c.chainId == chainId)?.rpc as string[];
      // Shuffle RPCs
      for (let i = rpc.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rpc[i], rpc[j]] = [rpc[j], rpc[i]];
      }
      const results = rpc.filter(theRpc => theRpc.startsWith("https")).map(async (theRpc) => { 
        try {
          return await axios({
            method: req.method,
            url: `${theRpc}${path}`,
            timeout: 1000, // Low timeout
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'RPCRelay v1'
            },
            data: req.body
          });
        } catch (e) {
          return null;
        }
      });
      while (results.length) {
        let result = await results.pop();
        if (!result) {
          continue;
        }
        res.status(result.status).send(result.data);
        return;
      }
      res.status(500).send({
        message: 'All RPCs failed'
      });
    });

    console.log(boxen(chalk.white.bold('RPC Relay Server'), {
      borderStyle: 'round',
      borderColor: 'green',
      backgroundColor: '#555555'
    }));
    app.listen(appData.server.port, appData.server.host);
    break;
  case 'config':
    let doOver = true;
    const regex : RegExp = new RegExp("\([0-9]+\)", "g");
    while (doOver) {
      doOver = false;
      let prompt = await inquirer.prompt([
        {
          name: 'action',
          message: 'What do you want to do?',
          type: 'list',
          choices: [
            'Add Chain',
            'Edit Chain',
            'Remove Chain',
            'Modify Server'
          ]
        },
        {
          name: 'chainId',
          message: 'Enter the chain ID',
          type: 'input',
          when: (answers) => answers.action == 'Add Chain'
        },
        {
          name: 'chainlist',
          message: 'Initialize from chainlist.org',
          type: 'list',
          when: (answers) => answers.action == 'Add Chain',
          choices: [
            "Yes",
            "No"
          ]
        },
        {
          name: 'name',
          message: 'Enter the chain name',
          type: 'input',
          when: (answers) => answers.action == 'Add Chain' && answers.chainlist == "No"
        },
        {
          name: 'chainEdit',
          message: 'Choose the chain to edit',
          type: 'list',
          when: (answers) => answers.action == 'Edit Chain',
          choices: appData.chains.map((chain: any) => `${chain.name} (${chain.chainId})`)
        },
        {
          name: 'actionChain',
          message: 'What do you want to do?',
          type: 'list',
          when: (answers) => answers.action == 'Edit Chain',
          choices: [
            'Add RPC',
            'Remove RPC',
            'Change Chain ID',
            'Change Name'
          ]
        },
        {
          name: 'rpcAdd',
          message: 'Enter the RPC URL',
          type: 'input',
          when: (answers) => answers.action == 'Edit Chain' && answers.actionChain == 'Add RPC'
        },
        {
          name: 'rpcRemove',
          message: 'Choose the RPC to remove',
          type: 'list',
          when: (answers) => answers.action == 'Edit Chain' && answers.actionChain == 'Remove RPC',
          choices: (answers) => {
            const chain = appData.chains.find((chain: any) => chain.chainId == [...answers.chainEdit.match(regex)].pop().replace('(', '').replace(')', ''));
            return chain.rpc;
          }
        },
        {
          name: 'chainRemove',
          message: 'Choose the chain to remove',
          type: 'list',
          when: (answers) => answers.action == 'Remove Chain',
          choices: appData.chains.map((chain: any) => `${chain.name} (${chain.chainId})`)
        },
        {
          name: 'actionServer',
          message: 'What do you want to do?',
          type: 'list',
          when: (answers) => answers.action == 'Modify Server',
          choices: [
            'Change host',
            'Change port'
          ]
        },
        {
          name: 'host',
          message: `Enter the host (Currently ${appData.server.host})`,
          type: 'input',
          when: (answers) => answers.actionServer == 'Change host'
        },
        {
          name: 'port',
          message: `Enter the port (Currently ${appData.server.port})`,
          type: 'input',
          when: (answers) => answers.actionServer == 'Change port'
        },
        {
          name: 'redo',
          message: 'Do you want to do something else?',
          type: 'list',
          choices: [
            'Yes',
            'No'
          ]
        }
      ]);
      switch (prompt.action) {
        case 'Add Chain':
          if (prompt.chainlist == "Yes") {
            const chainlist = await axios.get(`https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-${prompt.chainId}.json`);
            const name = chainlist.data.name;
            const rpc = chainlist.data.rpc;
            appData.chains.push({
              chainId: prompt.chainId,
              name: name,
              rpc: rpc
            });
          } else {
            appData.chains.push({
              chainId: prompt.chainId,
              name: prompt.name,
              rpc: []
            });
          }
          break;
        case 'Edit Chain':
          const chain = appData.chains.find((chain: any) => chain.chainId == [...prompt.chainEdit.match(regex)].pop().replace('(', '').replace(')', ''));
          switch (prompt.actionChain) {
            case 'Add RPC':
              chain.rpc.push(prompt.rpcAdd);
              break;
            case 'Remove RPC':
              chain.rpc.splice(chain.rpc.indexOf(prompt.rpcRemove), 1);
              break;
            case 'Change Chain ID':
              chain.chainId = prompt.chainId;
              break;
            case 'Change Name':
              chain.name = prompt.name;
              break;
          }
          break;
        case 'Remove Chain':
          appData.chains.splice(appData.chains.indexOf(appData.chains.find((chain: any) => chain.chainId == [...prompt.chainRemove.match(regex)].pop().replace('(', '').replace(')', ''))), 1);
          break;
        case 'Modify Server':
          switch (prompt.actionServer) {
            case 'Change host':
              appData.server.host = prompt.host;
              break;
            case 'Change port':
              appData.server.port = prompt.port;
              break;
          }
          break;
      }
      await fsP.writeFile(appDataFile, JSON.stringify(appData, null, 2));
      if (prompt.redo == "Yes") {
        doOver = true;
      }
    }
    break;
}