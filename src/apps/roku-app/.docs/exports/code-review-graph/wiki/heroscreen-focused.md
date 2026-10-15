# heroscreen-focused

## Overview

Directory-based community: components/HeroScreen

- **Size**: 6 nodes
- **Cohesion**: 0.0417
- **Dominant Language**: brightscript

## Members

| Name | Kind | File | Lines |
|------|------|------|-------|
| Init | Function | /home/user/roku-graphify/demo/roku-app/components/HeroScreen/HeroScreen.brs | 4-30 |
| makeRequest | Function | /home/user/roku-graphify/demo/roku-app/components/HeroScreen/HeroScreen.brs | 33-50 |
| onContentChanged | Function | /home/user/roku-graphify/demo/roku-app/components/HeroScreen/HeroScreen.brs | 53-57 |
| OnItemFocused | Function | /home/user/roku-graphify/demo/roku-app/components/HeroScreen/HeroScreen.brs | 60-74 |
| onVisibleChange | Function | /home/user/roku-graphify/demo/roku-app/components/HeroScreen/HeroScreen.brs | 77-80 |
| onFocusedChildChange | Function | /home/user/roku-graphify/demo/roku-app/components/HeroScreen/HeroScreen.brs | 83-86 |

## Execution Flows

- **Init** (criticality: 0.48, depth: 1)

## Dependencies

### Outgoing

- `m.top.findNode` (2 edge(s))
- `m.top.observeField` (2 edge(s))
- `m.rowList.setFocus` (2 edge(s))
- `CreateObject` (1 edge(s))
- `m.UriHandler.observeField` (1 edge(s))
- `itemFocused.Count` (1 edge(s))
- `m.top.content.getChild(itemFocused[0]).getChild` (1 edge(s))
- `m.top.content.getChild` (1 edge(s))
- `URLs.count` (1 edge(s))
- `createObject` (1 edge(s))
- `type` (1 edge(s))
- `context.addFields` (1 edge(s))
- `m.top.isInFocusChain` (1 edge(s))
- `m.rowList.hasFocus` (1 edge(s))

### Incoming

- `/home/user/roku-graphify/demo/roku-app/components/HeroScreen/HeroScreen.brs` (6 edge(s))
