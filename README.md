# RPCRelay

Relay RPC requests to a list of RPC providers.

## Why would I use this?

Censorship-resistance. If your request fails, it will get sent to a second RPC, then a third RPC, and so on. If any RPC doesn't censor a transaction, your transaction will be submitted.

## Why not use your own local GETH node?

This is a great idea! The downside is that it requires a few terabytes of space to store the chain, so it's not ideal. This allows you to be able to avoid a single point of failure without  

## How do I use this?

### Installation

```shell
npm install -g rpcrelay
```

### Configuration

```shell
rpcrelay config
```

### Run

```shell
rpcrelay run
```

The above command will start the RPCRelay server. It is recommended to use a process manager like `systemctl` to have this start in the background on boot.
