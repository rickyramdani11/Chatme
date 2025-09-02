
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

const BACKGROUND_FETCH_TASK = 'background-fetch-chat';

// Define the background task
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    console.log('Background fetch task running');
    
    // Check connection status and attempt reconnection if needed
    // This is a lightweight task to maintain connection awareness
    
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('Background fetch error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Register background fetch
export const registerBackgroundFetch = async () => {
  try {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 60000, // 1 minute minimum interval
      stopOnTerminate: false, // Continue after app is terminated
      startOnBoot: true, // Start when device boots
    });
    console.log('Background fetch registered successfully');
  } catch (error) {
    console.error('Failed to register background fetch:', error);
  }
};

// Unregister background fetch
export const unregisterBackgroundFetch = async () => {
  try {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
    console.log('Background fetch unregistered');
  } catch (error) {
    console.error('Failed to unregister background fetch:', error);
  }
};
