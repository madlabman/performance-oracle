// import * as cron from 'node-cron';
import { main } from './tasks.js';

// Fork process and run the task
// cron.schedule('*/2 * * * *', main);
main().catch();
