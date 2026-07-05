insert into public.message_templates (name, type, content, sort_order)
values
  (
    '每日课程预告',
    'noon',
    '姐妹们，{{上课时间}}「{{课程主题}}」别忘啦～
这节会讲{{课程亮点}}，适合{{适合人群}}。
想听的同学先把链接收好：{{直播链接}}

{{上课时间}}不见不散呀～
看到的同学可以接龙一下：1',
    1
  ),
  (
    '课前提醒',
    'before',
    '还有 1 个小时开课啦，想听「{{课程主题}}」的同学可以准备一下了。
今天会比较实操，边听边跟着做更容易有感觉。
链接放这里：{{直播链接}}

{{上课时间}}不见不散呀～
看到的同学可以接龙一下：1',
    2
  )
on conflict do nothing;

with preset as (
  insert into public.lesson_presets (
    name,
    camp_name,
    topic,
    teacher,
    class_time,
    duration_minutes,
    highlights,
    audience,
    groups
  )
  values (
    'AI 电商设计接单 8 节课',
    'AI 电商设计接单训练营',
    'AI 电商设计接单实战',
    '王鑫',
    '20:00',
    90,
    'AI 电商设计服务、闲鱼获客、小红书/朋友圈引流、客户成交、报价定金、交付对接、作业点评',
    '想用 AI 电商设计接单、展示案例、获客成交的同学',
    array['AI电商设计轻创学习群']
  )
  on conflict (name) do update set
    camp_name = excluded.camp_name,
    topic = excluded.topic,
    teacher = excluded.teacher,
    class_time = excluded.class_time,
    duration_minutes = excluded.duration_minutes,
    highlights = excluded.highlights,
    audience = excluded.audience,
    groups = excluded.groups
  returning id
)
insert into public.lesson_preset_items (preset_id, day_number, sort_order, kind, title, detail)
select preset.id, item.day_number, item.sort_order, item.kind, item.title, item.detail
from preset
cross join (
  values
    (1, 1, '正课', '看懂赛道', 'AI 电商设计有哪些服务？普通人如何通过电商设计接单获得收益？'),
    (2, 2, '点评', '第1课作业点评：看懂赛道', '围绕 AI 电商设计服务、接单收益路径，点评同学的赛道理解和作业。'),
    (3, 3, '正课', '闲鱼获客实操', '如何搭建账号、发布商品、展示案例，让有设计需求的商家找到你？'),
    (4, 4, '点评', '第2课作业点评：闲鱼获客实操', '点评闲鱼账号搭建、商品发布和案例展示，让获客动作更清楚。'),
    (5, 5, '正课', '内容展示与客户引流', '如何在小红书、朋友圈等平台展示 AI 电商案例，吸引商家主动咨询？'),
    (6, 6, '点评', '第3课作业点评：内容展示与客户引流', '点评小红书、朋友圈等平台的案例展示内容，优化客户主动咨询路径。'),
    (7, 7, '正课', '客户成交与交付对接', '如何沟通需求、进行报价、收取定金，并把订单准确交给设计团队完成制作？'),
    (8, 8, '点评', '第4课作业点评：客户成交与交付对接', '点评需求沟通、报价、定金收取和交付对接流程，帮同学把成交动作跑顺。')
) as item(day_number, sort_order, kind, title, detail)
on conflict (preset_id, sort_order) do update set
  day_number = excluded.day_number,
  kind = excluded.kind,
  title = excluded.title,
  detail = excluded.detail;
