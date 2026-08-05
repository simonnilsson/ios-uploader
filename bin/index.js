#!/usr/bin/env node

import { run, stop } from './cli.js';

process.on('SIGINT', () => stop(2));
process.on('SIGTERM', () => stop(15));
run();
