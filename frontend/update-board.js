const fs = require('fs');
let content = fs.readFileSync('src/components/CollectionBoard.vue', 'utf8');

content = content.replace('import { getBangumiCollections, getConfig }', 'import { getBangumiCollections, getConfig, getSubscriptions }');

content = content.replace('const collections = ref<any[]>([]);', 'const collections = ref<any[]>([]);\nconst subscribedIds = ref<number[]>([]);');

content = content.replace('const onSubscribeSuccess = () => {\r\n  // refresh after subscription\r\n  fetchCollections();\r\n};', 'const onSubscribeSuccess = () => {\n  fetchData();\n};');

content = content.replace('const onSubscribeSuccess = () => {\n  // refresh after subscription\n  fetchCollections();\n};', 'const onSubscribeSuccess = () => {\n  fetchData();\n};');

content = content.replace('  fetchCollections();\r\n});', '  fetchData();\r\n});');
content = content.replace('  fetchCollections();\n});', '  fetchData();\n});');

const fetchMore = `
const fetchSubscriptions = async () => {
  try {
    const res = await getSubscriptions();
    subscribedIds.value = res.data?.map((s: any) => s.bangumiSubjectId).filter(Boolean) || [];
  } catch (error) {
    console.error("Error fetching subscriptions", error);
  }
};

const fetchData = async () => {
  loading.value = true;
  await fetchSubscriptions();
  await fetchCollections();
  loading.value = false;
};
`;

content = content.replace('const fetchSettings', fetchMore + '\nconst fetchSettings');

content = content.replace('fetchCollections();', 'fetchData();');
content = content.replace('fetchCollections();', 'fetchData();');

content = content.replace(':bangumi="item"', ':bangumi="item"\n            :is-subscribed="subscribedIds.includes(item.subject.id)"');

fs.writeFileSync('src/components/CollectionBoard.vue', content, 'utf8');
console.log("Updated CollectionBoard.vue");