# content-response

## Overview

Directory-based community: components/Content

- **Size**: 11 nodes
- **Cohesion**: 0.0000
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
| addRequest | Function | /home/user/roku-graphify/demo/roku-app/components/Content/UriHandler.brs | 118-173 |
| processResponse | Function | /home/user/roku-graphify/demo/roku-app/components/Content/UriHandler.brs | 180-210 |

## Execution Flows

No execution flows pass through this community.

## Dependencies

### Outgoing

- `createObject` (11 edge(s))
- `type` (10 edge(s))
- `xmlitem.getname` (3 edge(s))
- `mediacontentitem.getattributes` (3 edge(s))
- `msg.getField` (3 edge(s))
- `msg.GetResponseCode` (3 edge(s))
- `AddAndSetFields` (2 edge(s))
- `row.appendChild` (2 edge(s))
- `Parent.appendChild` (2 edge(s))
- `xml.getchildelements` (2 edge(s))
- `xmlitem.getchildelements` (2 edge(s))
- `result.push` (2 edge(s))
- `trim` (2 edge(s))
- `stri` (2 edge(s))
- `m.top.observeField` (2 edge(s))

### Incoming

- `/home/user/roku-graphify/demo/roku-app/components/Content/UriHandler.brs` (5 edge(s))
- `/home/user/roku-graphify/demo/roku-app/components/Content/Parser.brs` (4 edge(s))
- `/home/user/roku-graphify/demo/roku-app/components/Content/SGHelperFunctions.brs` (2 edge(s))
