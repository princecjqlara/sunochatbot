import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import TelegramTopicRoutes from './TelegramTopicRoutes';

it('shows every operational route and groups shared receipt destinations into a single link',()=>{
 const html=renderToStaticMarkup(createElement(TelegramTopicRoutes,{chatId:-1002894511895,
  topics:{general:1,announcements:16,active:7581,clients:7673,receipts:4,close:4,done:4,songs:7692}}));
 expect(html.match(/<a /g)).toHaveLength(6);
 expect(html).toContain('Receipts / Sales');
 expect(html).toContain('https://t.me/c/2894511895/7692');
 expect(html).toContain('Active tomorrow');
});

it('omits unsupported fields, invalid destinations and private recipients',()=>{
 const html=renderToStaticMarkup(createElement(TelegramTopicRoutes,{chatId:-1004498344479,
  topics:{songs:133,receipts:-8,active:true,secret:50}}));
 expect(html.match(/<a /g)).toHaveLength(1);
 expect(html).toContain('https://t.me/c/4498344479/133');
 expect(html).not.toContain('secret');
 expect(renderToStaticMarkup(createElement(TelegramTopicRoutes,{chatId:123,topics:{songs:133}}))).toBe('');
});
