# content-parse

## Overview

Directory-based community: components/Content

- **Size**: 9 nodes
- **Cohesion**: 0.0462
- **Dominant Language**: brightscript

## Members

| Name | Kind | File | Lines |
|------|------|------|-------|
| init | Function | /home/user/roku-graphify/demo/roku-app/components/Content/Parser.brs | 3-5 |
| parseResponse | Function | /home/user/roku-graphify/demo/roku-app/components/Content/Parser.brs | 9-89 |
| createRow | Function | /home/user/roku-graphify/demo/roku-app/components/Content/Parser.brs | 92-104 |
| createGrid | Function | /home/user/roku-graphify/demo/roku-app/components/Content/Parser.brs | 110-128 |
| select | Function | /home/user/roku-graphify/demo/roku-app/components/Content/SGHelperFunctions.brs | 4-11 |
| AddAndSetFields | Function | /home/user/roku-graphify/demo/roku-app/components/Content/SGHelperFunctions.brs | 14-28 |
| init | Function | /home/user/roku-graphify/demo/roku-app/components/Content/UriHandler.brs | 13-36 |
| updateContent | Function | /home/user/roku-graphify/demo/roku-app/components/Content/UriHandler.brs | 39-66 |
| go | Function | /home/user/roku-graphify/demo/roku-app/components/Content/UriHandler.brs | 79-107 |

## Execution Flows

- **parseResponse** (criticality: 0.36, depth: 1)
- **go** (criticality: 0.36, depth: 1)

## Dependencies

### Outgoing

- `createObject` (9 edge(s))
- `xmlitem.getname` (3 edge(s))
- `mediacontentitem.getattributes` (3 edge(s))
- `msg.getField` (3 edge(s))
- `AddAndSetFields` (2 edge(s))
- `row.appendChild` (2 edge(s))
- `Parent.appendChild` (2 edge(s))
- `xml.getchildelements` (2 edge(s))
- `xmlitem.getchildelements` (2 edge(s))
- `result.push` (2 edge(s))
- `m.top.observeField` (2 edge(s))
- `list.count` (1 edge(s))
- `CreateObject` (1 edge(s))
- `xml.Parse` (1 edge(s))
- `xmlitem.gettext` (1 edge(s))

### Incoming

- `/home/user/roku-graphify/demo/roku-app/components/Content/Parser.brs` (4 edge(s))
- `/home/user/roku-graphify/demo/roku-app/components/Content/UriHandler.brs` (3 edge(s))
- `/home/user/roku-graphify/demo/roku-app/components/Content/SGHelperFunctions.brs` (2 edge(s))
