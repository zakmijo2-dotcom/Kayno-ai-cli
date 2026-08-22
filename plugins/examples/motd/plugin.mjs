export const name = 'motd';
export const version = '1.0.0';
export const description = 'Example NOVA plugin: message-of-the-day command + beforeRequest logger';

export function setup() {
  return {
    commands: {
      motd: () => {
        console.log('🚀 Ship small, ship often. — NOVA example plugin');
      },
      time: () => {
        console.log(new Date().toLocaleString());
      },
    },
  };
}

export async function beforeRequest(ctx) {
  if (ctx.meta?.quietPlugins) return;
  console.error(`[motd plugin] → ${ctx.provider} / ${ctx.model}`);
}
