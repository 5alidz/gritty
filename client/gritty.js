'use strict';

require('xterm/dist/xterm.css');
require('../css/gritty.css');

require('xterm/dist/addons/fit');

const currify = require('currify/legacy');

const cursorBlink = require('./cursor-blink');
const getEl = require('./get-el');
const getHost = require('./get-host');
const getEnv = require('./get-env');
const timeout = require('./timeout');

const wrap = (fn) => () => (...args) => fn(...args);

// auth check delay
const onConnect = timeout(wrap(_onConnect));
const onDisconnect = wrap(_onDisconnect);
const onData = currify(_onData);
const onTermResize = currify(_onTermResize);

const io = require('socket.io-client/dist/socket.io.min');

window.Promise = window.Promise || require('promise-polyfill');
window.fetch = window.fetch || require('whatwg-fetch');

const Terminal = require('xterm/dist/xterm');

module.exports = gritty;
module.exports._onConnect = _onConnect;
module.exports._onDisconnect = _onDisconnect;
module.exports._onData = _onData;
module.exports._onTermResize = _onTermResize;

function gritty(element, options = {}) {
    const el = getEl(element);
    
    const socketPath = options.socketPath || '';
    const prefix = options.prefix || '/gritty';
    const env = getEnv(options.env || {});
    
    const socket = connect(prefix, socketPath);
    
    return createTerminal(el, {
        env,
        socket,
    });
}

function createTerminal(terminalContainer, {env, socket}) {
    const terminal = new Terminal({
        scrollback: 1000,
        tabStopWidth: 4,
        theme: 'gritty',
    });
    
    const blink = cursorBlink(terminal);
    
    terminal.open(terminalContainer);
    terminal.fit();
    
    terminal.on('resize', onTermResize(socket));
    terminal.on('data', (data) => {
        socket.emit('data', data);
    });
    
    window.addEventListener('resize', () => {
        terminal.fit();
    });
  
    const {cols, rows} = terminal.proposeGeometry()
    
    socket.on('connect', onConnect(blink, socket, {env, cols, rows}));
    socket.on('disconnect', onDisconnect(blink, terminal));
    socket.on('data', onData(terminal));
    
    return {
        socket,
        terminal
    };
}

function _onConnect(blink, socket, {env, cols, rows}) {
    blink(true);
    
    socket.emit('terminal', {env, cols, rows});
    socket.emit('resize', {cols, rows});
}

function _onDisconnect(blink, terminal) {
    terminal.writeln('terminal disconnected...');
    blink(false);
}

function _onData(terminal, data) {
    terminal.write(data);
}

function _onTermResize(socket, {cols, rows}) {
    socket.emit('resize', {cols, rows});
}

function connect(prefix, socketPath) {
    const href = getHost();
    const FIVE_SECONDS = 5000;
    
    const path = socketPath + '/socket.io';
    const socket = io.connect(href + prefix, {
        'max reconnection attempts' : Math.pow(2, 32),
        'reconnection limit'        : FIVE_SECONDS,
        path
    });
    
    return socket;
}

