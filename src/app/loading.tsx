'use client';
import { ActivityIndicator } from '@ankhorage/zora/web/activity-indicator';
import { View } from '@ankhorage/zora/web/view';

/*** Keeps the initial loading indicator compact while the project snapshot loads. */
export default function Loading() {
  return (
    <View align="center" justify="center" p="l" style={{ alignSelf: 'center' }}>
      <ActivityIndicator testID="loader" />
    </View>
  );
}
