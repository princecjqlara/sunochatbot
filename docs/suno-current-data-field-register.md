# Current Suno field preservation register

Read-only schema metadata snapshot; no customer rows or credentials. Feature IDs refer to the compatibility master plan.

Each existing field has a retain/reconcile requirement. This is not an approved transform/drop/rename script. Final types, defaults, constraints, functions and triggers must be reconciled during the database rehearsal.

## business_users

Primary coverage: F02. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `business_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `user_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `role` | `text` | NO | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |

## businesses

Primary coverage: F02. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `name` | `text` | NO | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |

## campaign_delivery_failures

Primary coverage: F30. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `campaign_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `contact_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `error_message` | `text` | NO | Retain/reconcile; no mutation approved |
| `failed_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `attempt_count` | `smallint` | NO | Retain/reconcile; no mutation approved |

## campaign_recipients

Primary coverage: F30. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `campaign_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `contact_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `status` | `text` | NO | Retain/reconcile; no mutation approved |
| `scheduled_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `next_scheduled_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `sent_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `error_message` | `text` | YES | Retain/reconcile; no mutation approved |
| `claim_token` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `claimed_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `message_sent_count` | `integer` | YES | Retain/reconcile; no mutation approved |
| `last_contacted_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |

## campaigns

Primary coverage: F30. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `name` | `text` | NO | Retain/reconcile; no mutation approved |
| `message_text` | `text` | YES | Retain/reconcile; no mutation approved |
| `status` | `text` | NO | Retain/reconcile; no mutation approved |
| `scheduled_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `audience_mode` | `text` | YES | Retain/reconcile; no mutation approved |
| `audience_start_date` | `date` | YES | Retain/reconcile; no mutation approved |
| `audience_include_tag_ids` | `jsonb` | YES | Retain/reconcile; no mutation approved |
| `audience_exclude_tag_ids` | `jsonb` | YES | Retain/reconcile; no mutation approved |
| `audience_materialized_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `template_media_header` | `jsonb` | YES | Retain/reconcile; no mutation approved |
| `template_media_headers` | `jsonb` | YES | Retain/reconcile; no mutation approved |
| `next_attempt_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `last_error` | `text` | YES | Retain/reconcile; no mutation approved |
| `background_delivery_enabled` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `is_loop` | `boolean` | YES | Retain/reconcile; no mutation approved |
| `ai_prompt` | `text` | YES | Retain/reconcile; no mutation approved |
| `loop_status` | `text` | YES | Retain/reconcile; no mutation approved |
| `last_run_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `use_ai_message` | `boolean` | YES | Retain/reconcile; no mutation approved |
| `scheduled_date` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `use_best_time` | `boolean` | YES | Retain/reconcile; no mutation approved |
| `template_name` | `text` | YES | Retain/reconcile; no mutation approved |
| `template_language` | `text` | YES | Retain/reconcile; no mutation approved |
| `recurrence` | `text` | YES | Retain/reconcile; no mutation approved |
| `recurrence_end_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `started_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `completed_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `recipient_history_purged_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `total_recipients` | `integer` | YES | Retain/reconcile; no mutation approved |
| `sent_count` | `integer` | YES | Retain/reconcile; no mutation approved |
| `failed_count` | `integer` | YES | Retain/reconcile; no mutation approved |
| `created_by` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |

## chatbot_configs

Primary coverage: F17. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `enabled` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `trial_mode_enabled` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `trial_contact_id` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `instructions` | `text` | NO | Retain/reconcile; no mutation approved |
| `fallback_reply` | `text` | NO | Retain/reconcile; no mutation approved |
| `model` | `text` | NO | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `rag_enabled` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `follow_up_prompt` | `text` | NO | Retain/reconcile; no mutation approved |
| `details_to_collect` | `jsonb` | NO | Retain/reconcile; no mutation approved |
| `split_messages` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `max_message_parts` | `integer` | NO | Retain/reconcile; no mutation approved |
| `stop_when_details_collected` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `stop_on_opt_out` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `stop_on_refusal` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `stop_on_qualified` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `stop_on_not_qualified` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `stop_on_converted` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `stop_on_order_created` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `details_completion_percent` | `integer` | NO | Retain/reconcile; no mutation approved |
| `bot_dos` | `text` | NO | Retain/reconcile; no mutation approved |
| `bot_donts` | `text` | NO | Retain/reconcile; no mutation approved |
| `follow_up_enabled` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `follow_up_quick_delays_minutes` | `jsonb` | NO | Retain/reconcile; no mutation approved |
| `follow_up_best_time_days` | `jsonb` | NO | Retain/reconcile; no mutation approved |
| `follow_up_messages` | `jsonb` | NO | Retain/reconcile; no mutation approved |
| `follow_up_utility_template_name` | `text` | NO | Retain/reconcile; no mutation approved |
| `follow_up_utility_template_language` | `text` | NO | Retain/reconcile; no mutation approved |
| `follow_up_utility_text` | `text` | NO | Retain/reconcile; no mutation approved |
| `follow_up_media_asset_id` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `follow_up_ai_instructions` | `text` | NO | Retain/reconcile; no mutation approved |
| `knowledge_source_page_id` | `uuid` | YES | Retain/reconcile; no mutation approved |

## chatbot_contact_states

Primary coverage: F16/F19/F20/F21. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `contact_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `status` | `text` | NO | Retain/reconcile; no mutation approved |
| `started_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `window_expires_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `collected_details` | `jsonb` | NO | Retain/reconcile; no mutation approved |
| `missing_details` | `jsonb` | NO | Retain/reconcile; no mutation approved |
| `stop_reason` | `text` | YES | Retain/reconcile; no mutation approved |
| `stopped_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `last_inbound_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `last_bot_reply_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `history_start_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `human_pause_status` | `text` | YES | Retain/reconcile; no mutation approved |
| `human_takeover_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `human_resume_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `human_message_id` | `text` | YES | Retain/reconcile; no mutation approved |
| `human_hold_reason` | `text` | YES | Retain/reconcile; no mutation approved |
| `conversation_price_quote` | `text` | YES | Retain/reconcile; no mutation approved |
| `conversation_price_quoted_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `form_sent_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |

## chatbot_drive_files

Primary coverage: F18. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `folder_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `knowledge_document_id` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `drive_file_id` | `text` | NO | Retain/reconcile; no mutation approved |
| `name` | `text` | NO | Retain/reconcile; no mutation approved |
| `mime_type` | `text` | NO | Retain/reconcile; no mutation approved |
| `media_type` | `text` | NO | Retain/reconcile; no mutation approved |
| `size_bytes` | `bigint` | YES | Retain/reconcile; no mutation approved |
| `web_view_url` | `text` | NO | Retain/reconcile; no mutation approved |
| `thumbnail_url` | `text` | YES | Retain/reconcile; no mutation approved |
| `modified_time` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `auto_send` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `created_by` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `relative_path` | `text` | NO | Retain/reconcile; no mutation approved |

## chatbot_drive_folders

Primary coverage: F18. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `knowledge_document_id` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `name` | `text` | NO | Retain/reconcile; no mutation approved |
| `folder_url` | `text` | NO | Retain/reconcile; no mutation approved |
| `usage_notes` | `text` | NO | Retain/reconcile; no mutation approved |
| `button_text` | `text` | NO | Retain/reconcile; no mutation approved |
| `auto_send` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `created_by` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `file_count` | `integer` | NO | Retain/reconcile; no mutation approved |
| `last_synced_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `sync_status` | `text` | NO | Retain/reconcile; no mutation approved |
| `sync_error` | `text` | YES | Retain/reconcile; no mutation approved |

## chatbot_follow_up_jobs

Primary coverage: F21. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `contact_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `anchor_inbound_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `schedule_type` | `text` | NO | Retain/reconcile; no mutation approved |
| `sequence_index` | `integer` | NO | Retain/reconcile; no mutation approved |
| `due_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `message_text` | `text` | NO | Retain/reconcile; no mutation approved |
| `status` | `text` | NO | Retain/reconcile; no mutation approved |
| `message_id` | `text` | YES | Retain/reconcile; no mutation approved |
| `error_message` | `text` | YES | Retain/reconcile; no mutation approved |
| `attempt_count` | `integer` | NO | Retain/reconcile; no mutation approved |
| `claimed_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `sent_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `cancelled_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `media_asset_id` | `uuid` | YES | Retain/reconcile; no mutation approved |

## chatbot_interruption_events

Primary coverage: F20. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `contact_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `message_id` | `text` | NO | Retain/reconcile; no mutation approved |
| `actor_user_id` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `actor_name` | `text` | YES | Retain/reconcile; no mutation approved |
| `source` | `text` | NO | Retain/reconcile; no mutation approved |
| `collected_detail_count` | `integer` | NO | Retain/reconcile; no mutation approved |
| `required_detail_count` | `integer` | NO | Retain/reconcile; no mutation approved |
| `missing_detail_count` | `integer` | NO | Retain/reconcile; no mutation approved |
| `interrupted_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `interruption_type` | `text` | NO | Retain/reconcile; no mutation approved |
| `lead_stage` | `text` | YES | Retain/reconcile; no mutation approved |

## chatbot_knowledge_chunks

Primary coverage: F18. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `document_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `chunk_index` | `integer` | NO | Retain/reconcile; no mutation approved |
| `content` | `text` | NO | Retain/reconcile; no mutation approved |
| `char_count` | `integer` | NO | Retain/reconcile; no mutation approved |
| `embedding` | `USER-DEFINED` | NO | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |

## chatbot_knowledge_documents

Primary coverage: F18. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `title` | `text` | NO | Retain/reconcile; no mutation approved |
| `source_type` | `text` | NO | Retain/reconcile; no mutation approved |
| `original_filename` | `text` | YES | Retain/reconcile; no mutation approved |
| `content` | `text` | NO | Retain/reconcile; no mutation approved |
| `content_hash` | `text` | NO | Retain/reconcile; no mutation approved |
| `char_count` | `integer` | NO | Retain/reconcile; no mutation approved |
| `chunk_count` | `integer` | NO | Retain/reconcile; no mutation approved |
| `status` | `text` | NO | Retain/reconcile; no mutation approved |
| `error_message` | `text` | YES | Retain/reconcile; no mutation approved |
| `created_by` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `media_asset_id` | `uuid` | YES | Retain/reconcile; no mutation approved |

## chatbot_media_assets

Primary coverage: F18. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `knowledge_document_id` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `title` | `text` | NO | Retain/reconcile; no mutation approved |
| `usage_notes` | `text` | NO | Retain/reconcile; no mutation approved |
| `media_type` | `text` | NO | Retain/reconcile; no mutation approved |
| `mime_type` | `text` | NO | Retain/reconcile; no mutation approved |
| `original_filename` | `text` | NO | Retain/reconcile; no mutation approved |
| `storage_bucket` | `text` | NO | Retain/reconcile; no mutation approved |
| `storage_path` | `text` | NO | Retain/reconcile; no mutation approved |
| `file_size` | `integer` | NO | Retain/reconcile; no mutation approved |
| `analysis_text` | `text` | YES | Retain/reconcile; no mutation approved |
| `auto_send` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `status` | `text` | NO | Retain/reconcile; no mutation approved |
| `error_message` | `text` | YES | Retain/reconcile; no mutation approved |
| `created_by` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `source_folder` | `text` | NO | Retain/reconcile; no mutation approved |
| `source_relative_path` | `text` | NO | Retain/reconcile; no mutation approved |

## chatbot_message_deliveries

Primary coverage: F20/F21. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `contact_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `history_start_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `source_key` | `text` | NO | Retain/reconcile; no mutation approved |
| `message_text` | `text` | NO | Retain/reconcile; no mutation approved |
| `normalized_text` | `text` | NO | Retain/reconcile; no mutation approved |
| `message_hash` | `text` | NO | Retain/reconcile; no mutation approved |
| `status` | `text` | NO | Retain/reconcile; no mutation approved |
| `message_id` | `text` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `sent_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |

## chatbot_reply_events

Primary coverage: F20. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `inbound_message_id` | `text` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `contact_id` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `outbound_message_id` | `text` | YES | Retain/reconcile; no mutation approved |
| `status` | `text` | NO | Retain/reconcile; no mutation approved |
| `error_message` | `text` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |

## contact_interactions

Primary coverage: F21. Relation: not listed as a public base table; view/compatibility relation requires inspection.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `contact_id` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `interaction_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `hour_of_day` | `integer` | YES | Retain/reconcile; no mutation approved |
| `day_of_week` | `integer` | YES | Retain/reconcile; no mutation approved |
| `is_from_contact` | `boolean` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |

## contact_tags

Primary coverage: F22. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `contact_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `tag_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `created_by` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |

## contacts

Primary coverage: F05/F06. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `psid` | `text` | NO | Retain/reconcile; no mutation approved |
| `name` | `text` | YES | Retain/reconcile; no mutation approved |
| `profile_pic` | `text` | YES | Retain/reconcile; no mutation approved |
| `last_interaction_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `best_contact_hour` | `integer` | YES | Retain/reconcile; no mutation approved |
| `best_contact_confidence` | `text` | YES | Retain/reconcile; no mutation approved |
| `best_contact_hours` | `jsonb` | YES | Retain/reconcile; no mutation approved |
| `interaction_count` | `integer` | YES | Retain/reconcile; no mutation approved |
| `first_interaction_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `last_inbound_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `pipeline_stage` | `text` | NO | Retain/reconcile; no mutation approved |
| `pipeline_stage_source` | `text` | NO | Retain/reconcile; no mutation approved |
| `pipeline_stage_updated_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |

## conversation_export_jobs

Primary coverage: F32. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `created_by` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `format` | `text` | NO | Retain/reconcile; no mutation approved |
| `scope` | `text` | NO | Retain/reconcile; no mutation approved |
| `status` | `text` | NO | Retain/reconcile; no mutation approved |
| `contact_ids` | `jsonb` | NO | Retain/reconcile; no mutation approved |
| `next_contact_index` | `integer` | NO | Retain/reconcile; no mutation approved |
| `next_cursor` | `text` | YES | Retain/reconcile; no mutation approved |
| `total_items` | `integer` | YES | Retain/reconcile; no mutation approved |
| `processed_items` | `integer` | NO | Retain/reconcile; no mutation approved |
| `conversation_count` | `integer` | NO | Retain/reconcile; no mutation approved |
| `message_count` | `integer` | NO | Retain/reconcile; no mutation approved |
| `chunk_count` | `integer` | NO | Retain/reconcile; no mutation approved |
| `filename` | `text` | NO | Retain/reconcile; no mutation approved |
| `storage_prefix` | `text` | NO | Retain/reconcile; no mutation approved |
| `error_message` | `text` | YES | Retain/reconcile; no mutation approved |
| `attempt_count` | `smallint` | NO | Retain/reconcile; no mutation approved |
| `next_attempt_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `claim_token` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `claimed_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `started_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `completed_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `expires_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |

## outbound_message_events

Primary coverage: F20/F30. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `contact_id` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `message_id` | `text` | NO | Retain/reconcile; no mutation approved |
| `source_type` | `text` | NO | Retain/reconcile; no mutation approved |
| `source_id` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `source_name` | `text` | YES | Retain/reconcile; no mutation approved |
| `actor_user_id` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `actor_name` | `text` | YES | Retain/reconcile; no mutation approved |
| `message_kind` | `text` | YES | Retain/reconcile; no mutation approved |
| `sent_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |

## page_activity_history

Primary coverage: F32. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `actor_user_id` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `action_type` | `text` | NO | Retain/reconcile; no mutation approved |
| `entity_type` | `text` | NO | Retain/reconcile; no mutation approved |
| `entity_id` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `status` | `text` | NO | Retain/reconcile; no mutation approved |
| `summary` | `text` | NO | Retain/reconcile; no mutation approved |
| `target_count` | `integer` | NO | Retain/reconcile; no mutation approved |
| `success_count` | `integer` | NO | Retain/reconcile; no mutation approved |
| `failure_count` | `integer` | NO | Retain/reconcile; no mutation approved |
| `details` | `jsonb` | NO | Retain/reconcile; no mutation approved |
| `started_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `completed_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |

## page_sync_leases

Primary coverage: F33. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `owner` | `text` | NO | Retain/reconcile; no mutation approved |
| `acquired_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `expires_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |

## pages

Primary coverage: F03. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `fb_page_id` | `text` | NO | Retain/reconcile; no mutation approved |
| `name` | `text` | NO | Retain/reconcile; no mutation approved |
| `access_token` | `text` | NO | Retain/reconcile; no mutation approved |
| `business_id` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `last_synced_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `messaging_auto_tag_enabled` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `messaging_auto_tag_checked_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `messaging_auto_tag_cursor` | `text` | YES | Retain/reconcile; no mutation approved |
| `messaging_auto_tag_attempted_at` | `timestamp with time zone` | NO | Retain/reconcile; no mutation approved |
| `messaging_auto_tag_last_error` | `text` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |

## tag_shares

Primary coverage: F22. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `tag_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `shared_with_user_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |

## tags

Primary coverage: F22. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `name` | `text` | NO | Retain/reconcile; no mutation approved |
| `color` | `text` | YES | Retain/reconcile; no mutation approved |
| `owner_type` | `text` | NO | Retain/reconcile; no mutation approved |
| `owner_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `is_shared` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `is_default` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `system_key` | `text` | YES | Retain/reconcile; no mutation approved |

## user_pages

Primary coverage: F02/F03. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `user_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |

## users

Primary coverage: F01. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `email` | `text` | YES | Retain/reconcile; no mutation approved |
| `name` | `text` | YES | Retain/reconcile; no mutation approved |
| `image` | `text` | YES | Retain/reconcile; no mutation approved |
| `facebook_id` | `text` | YES | Retain/reconcile; no mutation approved |
| `password_hash` | `text` | YES | Retain/reconcile; no mutation approved |
| `role` | `text` | YES | Retain/reconcile; no mutation approved |
| `is_active` | `boolean` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |

## welcome_messages

Primary coverage: F31. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `enabled` | `boolean` | YES | Retain/reconcile; no mutation approved |
| `message_text` | `text` | NO | Retain/reconcile; no mutation approved |
| `buttons` | `jsonb` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |

## workflow_automation_states

Primary coverage: F21. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `automation_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `contact_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `status` | `text` | NO | Retain/reconcile; no mutation approved |
| `current_step_index` | `integer` | NO | Retain/reconcile; no mutation approved |
| `next_step_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `stopped_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `stopped_reason` | `text` | YES | Retain/reconcile; no mutation approved |
| `last_triggered_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `last_sent_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `last_contact_reply_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `completed_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |

## workflow_automations

Primary coverage: F21. Relation: public base table.

| Field | Existing data type | Nullable | Planned disposition |
| --- | --- | --- | --- |
| `id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `page_id` | `uuid` | NO | Retain/reconcile; no mutation approved |
| `name` | `text` | NO | Retain/reconcile; no mutation approved |
| `enabled` | `boolean` | NO | Retain/reconcile; no mutation approved |
| `trigger_type` | `text` | NO | Retain/reconcile; no mutation approved |
| `message_text` | `text` | NO | Retain/reconcile; no mutation approved |
| `stop_keywords` | `jsonb` | NO | Retain/reconcile; no mutation approved |
| `steps` | `jsonb` | NO | Retain/reconcile; no mutation approved |
| `reply_action` | `text` | NO | Retain/reconcile; no mutation approved |
| `page_stop_code` | `text` | YES | Retain/reconcile; no mutation approved |
| `cooldown_minutes` | `integer` | NO | Retain/reconcile; no mutation approved |
| `created_by` | `uuid` | YES | Retain/reconcile; no mutation approved |
| `created_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |
| `updated_at` | `timestamp with time zone` | YES | Retain/reconcile; no mutation approved |

## Existing function names

Preserve or explicitly supersede after signature/definition/access checks; names alone are not proof of equivalence.

- `acquire_page_sync_lease`
- `cancel_campaign_delivery`
- `claim_campaign_recipients`
- `claim_conversation_export_job`
- `cleanup_terminal_campaign_recipients`
- `create_default_page_tags`
- `create_filtered_tracked_bulk_campaign`
- `finish_campaign_recipient`
- `finish_campaign_recipient_batch`
- `finish_chatbot_message`
- `finish_loop_campaign_recipient`
- `get_campaign_delivery_progress`
- `get_chatbot_activity_analytics`
- `get_chatbot_contact_analytics`
- `get_chatbot_contact_metrics`
- `get_contact_pipeline_counts`
- `get_database_health`
- `match_chatbot_knowledge`
- `materialize_dynamic_campaign_audience`
- `pause_campaign_delivery`
- `preserve_contact_last_inbound_at`
- `record_chatbot_conversation_quote`
- `record_chatbot_form_sent`
- `record_chatbot_human_takeover`
- `release_page_sync_lease`
- `reserve_chatbot_message`
- `reset_chatbot_form_delivery`
- `update_updated_at_column`

## Existing trigger events

| Relation | Trigger | Timing | Event |
| --- | --- | --- | --- |
| `campaign_recipients` | `mirror_campaign_delivery_failure` | AFTER | INSERT |
| `campaign_recipients` | `mirror_campaign_delivery_failure` | AFTER | UPDATE |
| `campaigns` | `update_campaigns_updated_at` | BEFORE | UPDATE |
| `chatbot_configs` | `update_chatbot_configs_updated_at` | BEFORE | UPDATE |
| `chatbot_contact_states` | `chatbot_reset_form_delivery` | BEFORE | UPDATE |
| `chatbot_contact_states` | `update_chatbot_contact_states_updated_at` | BEFORE | UPDATE |
| `chatbot_drive_files` | `update_chatbot_drive_files_updated_at` | BEFORE | UPDATE |
| `chatbot_drive_folders` | `update_chatbot_drive_folders_updated_at` | BEFORE | UPDATE |
| `chatbot_follow_up_jobs` | `update_chatbot_follow_up_jobs_updated_at` | BEFORE | UPDATE |
| `chatbot_knowledge_documents` | `update_chatbot_knowledge_documents_updated_at` | BEFORE | UPDATE |
| `chatbot_media_assets` | `update_chatbot_media_assets_updated_at` | BEFORE | UPDATE |
| `contact_interactions` | `record_contact_interaction` | INSTEAD OF | INSERT |
| `contacts` | `preserve_contact_last_inbound_at` | BEFORE | UPDATE |
| `contacts` | `update_contacts_updated_at` | BEFORE | UPDATE |
| `conversation_export_jobs` | `update_conversation_export_jobs_updated_at` | BEFORE | UPDATE |
| `pages` | `create_default_page_tags_on_insert` | AFTER | INSERT |
| `pages` | `update_pages_updated_at` | BEFORE | UPDATE |
| `tags` | `update_tags_updated_at` | BEFORE | UPDATE |
| `users` | `update_users_updated_at` | BEFORE | UPDATE |
| `workflow_automation_states` | `update_workflow_automation_states_updated_at` | BEFORE | UPDATE |
| `workflow_automations` | `update_workflow_automations_updated_at` | BEFORE | UPDATE |

The baseline includes the `contact_interactions` relation outside the public base-table listing. Do not assume a missing pg_tables entry means activity data is absent or create a conflicting table over a compatibility view.
