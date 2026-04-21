ALTER TABLE `rss_sources` ADD `mikan_bangumi_id` integer;

UPDATE `rss_sources`
SET `mikan_bangumi_id` = CAST(
	CASE
		WHEN instr(substr(`url`, instr(`url`, 'bangumiId=') + 10), '&') > 0 THEN substr(
			substr(`url`, instr(`url`, 'bangumiId=') + 10),
			1,
			instr(substr(`url`, instr(`url`, 'bangumiId=') + 10), '&') - 1
		)
		ELSE substr(`url`, instr(`url`, 'bangumiId=') + 10)
	END AS integer
)
WHERE `mikan_bangumi_id` IS NULL
	AND instr(`url`, 'mikanani.me/RSS/Bangumi?bangumiId=') > 0;