
type HapticType = 'success' | 'error' | 'selection' | 'impactLight' | 'impactMedium' | 'impactHeavy';

export const triggerHaptic = (type: HapticType = 'selection') => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      switch (type) {
        case 'success':
          // Double pulse for success
          navigator.vibrate([10, 30, 10, 30]);
          break;
        case 'error':
          // Double heavy buzz for error
          navigator.vibrate([50, 50, 50]);
          break;
        case 'selection':
          // Very short tick for UI selection
          navigator.vibrate(10);
          break;
        case 'impactLight':
          navigator.vibrate(15);
          break;
        case 'impactMedium':
          navigator.vibrate(30);
          break;
        case 'impactHeavy':
          navigator.vibrate(50);
          break;
        default:
          navigator.vibrate(10);
      }
    } catch (e) {
      // Fail silently if vibration is not supported or allowed
    }
  }
};
