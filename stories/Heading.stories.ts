import { renderMarkdownStory } from "./render-story.ts";

export default {
  title: "Typography/Heading",
};

export const Levels = () =>
  renderMarkdownStory(`# Heading One

## Heading Two

### Heading Three

#### Heading Four

##### Heading Five

###### Heading Six`);
