-- Schema base do banco do MeuEcoo Mídia: só a ESTRUTURA de produção, sem nenhum dado.
--
-- Por que existe: as tabelas originais (contas, posts, tokens, logs...) foram criadas à mão no
-- protótipo e nunca viraram migration; a 003_multi_tenancy.sql já faz ALTER TABLE contas. Por isso
-- as migrations numeradas de src/db/migrations não montam um banco vazio (medido na CI em 03/10/2026:
-- "relation \"contas\" does not exist"). Este arquivo é o ponto de partida reproduzível; o
-- runtimeMigrations.js roda por cima dele, como no startup do servidor.
--
-- Gerado em 03/10/2026 com pg_dump 18 --schema-only --no-owner --no-privileges a partir do banco de
-- produção (linhas \restrict/\unrestrict do psql removidas, para rodar por qualquer cliente).
-- Para atualizar: repetir o mesmo comando e substituir o arquivo inteiro.

--
-- PostgreSQL database dump
--


-- Dumped from database version 18.6 (Debian 18.6-1.pgdg13+2)
-- Dumped by pg_dump version 18.6 (Debian 18.6-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: tipo_nivel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_nivel AS ENUM (
    'ESTRELA',
    'NICHO',
    'APOIO',
    'PROVA SOCIAL'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_activity_log (
    id integer NOT NULL,
    user_id integer,
    acao text NOT NULL,
    status text NOT NULL,
    modelo text,
    detalhes text,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: ai_activity_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_activity_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_activity_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_activity_log_id_seq OWNED BY public.ai_activity_log.id;


--
-- Name: ai_agent_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agent_approvals (
    nonce text NOT NULL,
    user_id integer NOT NULL,
    action text NOT NULL,
    arguments jsonb DEFAULT '{}'::jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_chat_messages (
    id integer NOT NULL,
    user_id integer NOT NULL,
    contexto text NOT NULL,
    role text NOT NULL,
    conteudo text NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: ai_chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_chat_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_chat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_chat_messages_id_seq OWNED BY public.ai_chat_messages.id;


--
-- Name: ai_demo_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_demo_usage (
    user_id integer NOT NULL,
    dia date NOT NULL,
    usos integer DEFAULT 0 NOT NULL
);


--
-- Name: ai_image_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_image_leads (
    id integer NOT NULL,
    user_id integer,
    email text NOT NULL,
    descricao text,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: ai_image_leads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_image_leads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_image_leads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_image_leads_id_seq OWNED BY public.ai_image_leads.id;


--
-- Name: ai_image_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_image_usage (
    user_id integer NOT NULL,
    usage_month date NOT NULL,
    images_used integer DEFAULT 0 NOT NULL,
    CONSTRAINT ai_image_usage_images_used_check CHECK ((images_used >= 0))
);


--
-- Name: ai_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_memory (
    id integer NOT NULL,
    user_id integer NOT NULL,
    model text NOT NULL,
    tipo text NOT NULL,
    conteudo text NOT NULL,
    resolvido boolean DEFAULT false,
    criado_em timestamp with time zone DEFAULT now(),
    lembrar_em timestamp with time zone
);


--
-- Name: ai_memory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_memory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_memory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_memory_id_seq OWNED BY public.ai_memory.id;


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    prefix text NOT NULL,
    key_hash text NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: api_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.api_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: api_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.api_keys_id_seq OWNED BY public.api_keys.id;


--
-- Name: app_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_events (
    id bigint NOT NULL,
    event_name text NOT NULL,
    payload jsonb NOT NULL,
    user_id integer,
    criado_em timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: app_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.app_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: app_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.app_events_id_seq OWNED BY public.app_events.id;


--
-- Name: approval_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_requests (
    id integer NOT NULL,
    workspace_id integer NOT NULL,
    post_id integer NOT NULL,
    requested_by integer NOT NULL,
    reviewed_by integer,
    status text DEFAULT 'pending'::text NOT NULL,
    feedback text,
    criado_em timestamp with time zone DEFAULT now(),
    revisado_em timestamp with time zone
);


--
-- Name: approval_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.approval_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: approval_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.approval_requests_id_seq OWNED BY public.approval_requests.id;


--
-- Name: billing_plan_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_plan_changes (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    from_plan text NOT NULL,
    to_plan text NOT NULL,
    amount_cents integer NOT NULL,
    currency text DEFAULT 'brl'::text NOT NULL,
    billing_month date NOT NULL,
    idempotency_key text NOT NULL,
    gateway text DEFAULT 'stripe'::text NOT NULL,
    gateway_session_id text,
    gateway_payment_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    checkout_url text,
    failure_code text,
    failure_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    meu_ecoo_email_status text,
    meu_ecoo_email_attempts integer DEFAULT 0 NOT NULL,
    meu_ecoo_email_sent_at timestamp with time zone,
    meu_ecoo_email_updated_at timestamp with time zone,
    meu_ecoo_email_last_error text,
    meu_ecoo_selected boolean DEFAULT false NOT NULL,
    meu_ecoo_amount_cents integer DEFAULT 0 NOT NULL,
    CONSTRAINT billing_plan_changes_amount_cents_check CHECK ((amount_cents >= 0)),
    CONSTRAINT billing_plan_changes_meu_ecoo_amount_non_negative CHECK ((meu_ecoo_amount_cents >= 0)),
    CONSTRAINT billing_plan_changes_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'paid'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: billing_plan_changes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.billing_plan_changes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: billing_plan_changes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.billing_plan_changes_id_seq OWNED BY public.billing_plan_changes.id;


--
-- Name: contas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contas (
    id integer CONSTRAINT contas_v2_id_not_null NOT NULL,
    platform character varying(20) CONSTRAINT contas_v2_platform_not_null NOT NULL,
    handle character varying(255) CONSTRAINT contas_v2_handle_not_null NOT NULL,
    tipo public.tipo_nivel CONSTRAINT contas_v2_tipo_not_null NOT NULL,
    ativo boolean DEFAULT true,
    criado_em timestamp without time zone DEFAULT now(),
    atualizado_em timestamp without time zone DEFAULT now(),
    user_id integer,
    avatar_url text,
    external_user_id character varying(64),
    zernio_account_id text,
    zernio_profile_id text
);


--
-- Name: contas_v2_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contas_v2_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contas_v2_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contas_v2_id_seq OWNED BY public.contas.id;


--
-- Name: content_queues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_queues (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    platforms text[] DEFAULT '{}'::text[] NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    recurrence jsonb DEFAULT '{"days": [1, 3, 5], "time": "10:00"}'::jsonb NOT NULL,
    next_run_at timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now()
);


--
-- Name: content_queues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.content_queues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: content_queues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.content_queues_id_seq OWNED BY public.content_queues.id;


--
-- Name: credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credentials (
    id integer NOT NULL,
    user_id integer NOT NULL,
    password_hash character varying(255) NOT NULL,
    reset_token character varying(255),
    reset_token_expires timestamp without time zone,
    atualizado_em timestamp without time zone DEFAULT now()
);


--
-- Name: credentials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.credentials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: credentials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.credentials_id_seq OWNED BY public.credentials.id;


--
-- Name: drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drafts (
    id integer NOT NULL,
    user_id integer NOT NULL,
    title text,
    text text,
    platforms text[] DEFAULT '{}'::text[],
    media_path text,
    media_type text,
    media_items jsonb,
    youtube_title text,
    youtube_visibility text DEFAULT 'public'::text,
    is_template boolean DEFAULT false,
    criado_em timestamp with time zone DEFAULT now(),
    text_by_platform jsonb,
    media_by_platform jsonb,
    first_comment text,
    tiktok_disable_stitch boolean,
    youtube_category_id text,
    tiktok_disable_comment boolean,
    youtube_format text,
    location_name text,
    tiktok_privacy_level text,
    ig_format text,
    tiktok_disable_duet boolean,
    location_id text,
    youtube_made_for_kids text,
    threads_reply_control text,
    linkedin_visibility text,
    pinterest_board_name text,
    pinterest_board_id text,
    facebook_format text DEFAULT 'post'::text
);


--
-- Name: drafts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.drafts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: drafts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.drafts_id_seq OWNED BY public.drafts.id;


--
-- Name: inbox_seen_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_seen_comments (
    user_id integer NOT NULL,
    post_id integer NOT NULL,
    seen_ids text[] DEFAULT '{}'::text[],
    atualizado_em timestamp with time zone DEFAULT now()
);


--
-- Name: instagram_followers_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_followers_history (
    id integer NOT NULL,
    conta_id integer NOT NULL,
    captured_on date DEFAULT CURRENT_DATE NOT NULL,
    follower_count integer NOT NULL
);


--
-- Name: instagram_followers_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.instagram_followers_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: instagram_followers_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.instagram_followers_history_id_seq OWNED BY public.instagram_followers_history.id;


--
-- Name: logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logs (
    id integer NOT NULL,
    type character varying(10) NOT NULL,
    message text NOT NULL,
    platform character varying(20),
    conta_id integer,
    criado_em timestamp without time zone DEFAULT now(),
    user_id integer,
    notification_key text
);


--
-- Name: logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.logs_id_seq OWNED BY public.logs.id;


--
-- Name: media_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_assets (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    mime_type text,
    size_bytes bigint,
    folder text DEFAULT 'Geral'::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: media_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.media_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: media_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.media_assets_id_seq OWNED BY public.media_assets.id;


--
-- Name: media_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_folders (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: media_folders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.media_folders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: media_folders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.media_folders_id_seq OWNED BY public.media_folders.id;


--
-- Name: oauth_flow_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_flow_states (
    state_hash text NOT NULL,
    user_id integer NOT NULL,
    payload jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: oauth_pkce_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_pkce_state (
    state text NOT NULL,
    code_verifier text NOT NULL,
    criado_em timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_health; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_health (
    platform text NOT NULL,
    status text DEFAULT 'unknown'::text NOT NULL,
    fail_count integer DEFAULT 0 NOT NULL,
    message text,
    checked_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_presets (
    id integer NOT NULL,
    user_id integer NOT NULL,
    platform text NOT NULL,
    name text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: platform_presets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.platform_presets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_presets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.platform_presets_id_seq OWNED BY public.platform_presets.id;


--
-- Name: post_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_accounts (
    id integer NOT NULL,
    post_id integer NOT NULL,
    account_id integer NOT NULL,
    instagram_pending jsonb,
    criado_em timestamp with time zone DEFAULT now(),
    media_items jsonb,
    publication_error text,
    provider_request_id text,
    publication_confirmed boolean DEFAULT false NOT NULL
);


--
-- Name: post_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.post_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: post_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.post_accounts_id_seq OWNED BY public.post_accounts.id;


--
-- Name: post_first_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_first_comments (
    id integer NOT NULL,
    post_publication_id integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now()
);


--
-- Name: post_first_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.post_first_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: post_first_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.post_first_comments_id_seq OWNED BY public.post_first_comments.id;


--
-- Name: post_metrics_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_metrics_history (
    id integer NOT NULL,
    post_id integer NOT NULL,
    captured_on date DEFAULT CURRENT_DATE NOT NULL,
    likes integer,
    comments integer,
    views integer,
    platform text
);


--
-- Name: post_metrics_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.post_metrics_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: post_metrics_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.post_metrics_history_id_seq OWNED BY public.post_metrics_history.id;


--
-- Name: post_publications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_publications (
    id integer NOT NULL,
    post_id integer NOT NULL,
    platform text NOT NULL,
    external_post_id text,
    published_at timestamp with time zone DEFAULT now(),
    account_id integer
);


--
-- Name: post_publications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.post_publications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: post_publications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.post_publications_id_seq OWNED BY public.post_publications.id;


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id integer NOT NULL,
    text text,
    platforms text[] NOT NULL,
    scheduled_at timestamp without time zone NOT NULL,
    repeat character varying(20) DEFAULT 'none'::character varying,
    status character varying(20) DEFAULT 'scheduled'::character varying,
    criado_em timestamp without time zone DEFAULT now(),
    media_path character varying(500),
    media_type character varying(20),
    media_items jsonb,
    youtube_title character varying(100),
    youtube_is_short boolean,
    user_id integer,
    youtube_visibility text DEFAULT 'public'::text NOT NULL,
    account_id integer,
    external_post_id text,
    external_platform text,
    published_at timestamp without time zone,
    instagram_pending jsonb,
    text_by_platform jsonb,
    youtube_category_id text,
    ig_format text,
    youtube_format text,
    title_by_platform jsonb,
    youtube_made_for_kids boolean,
    tiktok_privacy_level text,
    tiktok_disable_stitch boolean,
    tiktok_disable_duet boolean,
    tiktok_disable_comment boolean,
    retry_count integer DEFAULT 0 NOT NULL,
    next_retry_at timestamp with time zone,
    location_id text,
    first_comment text,
    location_name text,
    threads_reply_control text,
    linkedin_visibility text,
    pinterest_board_name text,
    pinterest_board_id text,
    error_message text,
    media_cleaned_at timestamp with time zone,
    media_cleanup_after timestamp with time zone,
    facebook_format text DEFAULT 'post'::text,
    cover_path text,
    cover_type text
);


--
-- Name: posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.posts_id_seq OWNED BY public.posts.id;


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    endpoint text NOT NULL,
    p256dh text,
    auth text,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.push_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.push_subscriptions_id_seq OWNED BY public.push_subscriptions.id;


--
-- Name: rate_limit_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit_counters (
    key text NOT NULL,
    hits integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT rate_limit_counters_hits_check CHECK ((hits >= 0))
);


--
-- Name: report_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_schedules (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    period_days integer DEFAULT 30 NOT NULL,
    platform text,
    recipients text[] DEFAULT '{}'::text[] NOT NULL,
    frequency text DEFAULT 'monthly'::text NOT NULL,
    branding jsonb DEFAULT '{}'::jsonb NOT NULL,
    next_run_at timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    last_sent_at timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now()
);


--
-- Name: report_schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.report_schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: report_schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.report_schedules_id_seq OWNED BY public.report_schedules.id;


--
-- Name: saved_texts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_texts (
    id integer NOT NULL,
    user_id integer NOT NULL,
    title text,
    body text NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: saved_texts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.saved_texts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saved_texts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.saved_texts_id_seq OWNED BY public.saved_texts.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    sid character varying(255) NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: smartlink_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.smartlink_items (
    id integer NOT NULL,
    smartlink_id integer NOT NULL,
    label text NOT NULL,
    url text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    clicks integer DEFAULT 0 NOT NULL
);


--
-- Name: smartlink_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.smartlink_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: smartlink_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.smartlink_items_id_seq OWNED BY public.smartlink_items.id;


--
-- Name: smartlink_slug_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.smartlink_slug_aliases (
    slug text NOT NULL,
    smartlink_id integer NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: smartlinks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.smartlinks (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    title text,
    description text,
    theme jsonb DEFAULT '{}'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: smartlinks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.smartlinks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: smartlinks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.smartlinks_id_seq OWNED BY public.smartlinks.id;


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    stripe_subscription_id text,
    stripe_price_id text,
    plan text NOT NULL,
    status text DEFAULT 'incomplete'::text NOT NULL,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'incomplete'::text, 'incomplete_expired'::text, 'past_due'::text, 'canceled'::text, 'unpaid'::text, 'paused'::text])))
);


--
-- Name: subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subscriptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subscriptions_id_seq OWNED BY public.subscriptions.id;


--
-- Name: tiktok_stats_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tiktok_stats_history (
    id integer NOT NULL,
    conta_id integer NOT NULL,
    captured_on date DEFAULT CURRENT_DATE NOT NULL,
    follower_count integer,
    likes_count integer,
    video_count integer
);


--
-- Name: tiktok_stats_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tiktok_stats_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tiktok_stats_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tiktok_stats_history_id_seq OWNED BY public.tiktok_stats_history.id;


--
-- Name: tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tokens (
    id integer NOT NULL,
    conta_id integer NOT NULL,
    platform character varying(20) NOT NULL,
    account_name character varying(150),
    access_token text NOT NULL,
    refresh_token text,
    expires_at timestamp without time zone,
    status character varying(20) DEFAULT 'valid'::character varying,
    criado_em timestamp without time zone DEFAULT now(),
    atualizado_em timestamp without time zone DEFAULT now()
);


--
-- Name: tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tokens_id_seq OWNED BY public.tokens.id;


--
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_achievements (
    user_id integer NOT NULL,
    marco integer NOT NULL,
    desbloqueado_em timestamp with time zone DEFAULT now()
);


--
-- Name: user_ai_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_ai_keys (
    id integer NOT NULL,
    user_id integer NOT NULL,
    modelo text NOT NULL,
    api_key text NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    last_four text,
    status text DEFAULT 'valid'::text NOT NULL
);


--
-- Name: user_ai_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_ai_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_ai_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_ai_keys_id_seq OWNED BY public.user_ai_keys.id;


--
-- Name: user_ai_prefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_ai_prefs (
    user_id integer NOT NULL,
    preferred_model text NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now()
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    full_name character varying(255),
    google_id character varying(255),
    ativo boolean DEFAULT true,
    criado_em timestamp without time zone DEFAULT now(),
    role character varying(20) DEFAULT 'user'::character varying NOT NULL,
    avatar_url text,
    totp_secret text,
    totp_enabled boolean DEFAULT false NOT NULL,
    default_platform text,
    timezone text DEFAULT 'America/Sao_Paulo'::text NOT NULL,
    language text DEFAULT 'pt-BR'::text NOT NULL,
    auth_tokens_invalidated_at timestamp with time zone,
    notification_preferences jsonb DEFAULT '{"email": true, "comments": true, "failures": true, "published": true}'::jsonb NOT NULL,
    plan text DEFAULT 'basico'::text NOT NULL,
    plan_unrestricted boolean DEFAULT false NOT NULL,
    allowed_platforms text[] DEFAULT ARRAY['instagram'::text, 'youtube'::text, 'tiktok'::text, 'facebook'::text] NOT NULL,
    plan_active boolean DEFAULT false NOT NULL,
    zernio_profile_id text,
    stripe_customer_id text
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: webhook_endpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_endpoints (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    secret text NOT NULL,
    events text[] DEFAULT '{post_published,approval_updated}'::text[] NOT NULL,
    active boolean DEFAULT true NOT NULL,
    last_status integer,
    last_error text,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: webhook_endpoints_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.webhook_endpoints_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: webhook_endpoints_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.webhook_endpoints_id_seq OWNED BY public.webhook_endpoints.id;


--
-- Name: workspace_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_members (
    workspace_id integer NOT NULL,
    user_id integer NOT NULL,
    role text DEFAULT 'editor'::text NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspaces (
    id integer NOT NULL,
    owner_id integer NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    branding jsonb DEFAULT '{}'::jsonb NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: workspaces_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workspaces_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workspaces_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workspaces_id_seq OWNED BY public.workspaces.id;


--
-- Name: youtube_stats_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.youtube_stats_history (
    id integer NOT NULL,
    conta_id integer NOT NULL,
    captured_on date DEFAULT CURRENT_DATE NOT NULL,
    subscriber_count integer
);


--
-- Name: youtube_stats_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.youtube_stats_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: youtube_stats_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.youtube_stats_history_id_seq OWNED BY public.youtube_stats_history.id;


--
-- Name: zernio_oauth_pending; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zernio_oauth_pending (
    id text NOT NULL,
    user_id integer NOT NULL,
    platform text NOT NULL,
    profile_id text NOT NULL,
    temp_token text NOT NULL,
    user_profile jsonb NOT NULL,
    connect_token text,
    criado_em timestamp with time zone DEFAULT now(),
    account_name text,
    return_to text
);


--
-- Name: zernio_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zernio_webhook_events (
    id bigint NOT NULL,
    event_id text NOT NULL,
    event_name text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    next_attempt_at timestamp with time zone,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    CONSTRAINT zernio_webhook_events_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'processed'::text])))
);


--
-- Name: zernio_webhook_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zernio_webhook_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zernio_webhook_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zernio_webhook_events_id_seq OWNED BY public.zernio_webhook_events.id;


--
-- Name: ai_activity_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_activity_log ALTER COLUMN id SET DEFAULT nextval('public.ai_activity_log_id_seq'::regclass);


--
-- Name: ai_chat_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_chat_messages ALTER COLUMN id SET DEFAULT nextval('public.ai_chat_messages_id_seq'::regclass);


--
-- Name: ai_image_leads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_image_leads ALTER COLUMN id SET DEFAULT nextval('public.ai_image_leads_id_seq'::regclass);


--
-- Name: ai_memory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_memory ALTER COLUMN id SET DEFAULT nextval('public.ai_memory_id_seq'::regclass);


--
-- Name: api_keys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys ALTER COLUMN id SET DEFAULT nextval('public.api_keys_id_seq'::regclass);


--
-- Name: app_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_events ALTER COLUMN id SET DEFAULT nextval('public.app_events_id_seq'::regclass);


--
-- Name: approval_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests ALTER COLUMN id SET DEFAULT nextval('public.approval_requests_id_seq'::regclass);


--
-- Name: billing_plan_changes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_plan_changes ALTER COLUMN id SET DEFAULT nextval('public.billing_plan_changes_id_seq'::regclass);


--
-- Name: contas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas ALTER COLUMN id SET DEFAULT nextval('public.contas_v2_id_seq'::regclass);


--
-- Name: content_queues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_queues ALTER COLUMN id SET DEFAULT nextval('public.content_queues_id_seq'::regclass);


--
-- Name: credentials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credentials ALTER COLUMN id SET DEFAULT nextval('public.credentials_id_seq'::regclass);


--
-- Name: drafts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drafts ALTER COLUMN id SET DEFAULT nextval('public.drafts_id_seq'::regclass);


--
-- Name: instagram_followers_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_followers_history ALTER COLUMN id SET DEFAULT nextval('public.instagram_followers_history_id_seq'::regclass);


--
-- Name: logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs ALTER COLUMN id SET DEFAULT nextval('public.logs_id_seq'::regclass);


--
-- Name: media_assets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets ALTER COLUMN id SET DEFAULT nextval('public.media_assets_id_seq'::regclass);


--
-- Name: media_folders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_folders ALTER COLUMN id SET DEFAULT nextval('public.media_folders_id_seq'::regclass);


--
-- Name: platform_presets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_presets ALTER COLUMN id SET DEFAULT nextval('public.platform_presets_id_seq'::regclass);


--
-- Name: post_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_accounts ALTER COLUMN id SET DEFAULT nextval('public.post_accounts_id_seq'::regclass);


--
-- Name: post_first_comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_first_comments ALTER COLUMN id SET DEFAULT nextval('public.post_first_comments_id_seq'::regclass);


--
-- Name: post_metrics_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_metrics_history ALTER COLUMN id SET DEFAULT nextval('public.post_metrics_history_id_seq'::regclass);


--
-- Name: post_publications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_publications ALTER COLUMN id SET DEFAULT nextval('public.post_publications_id_seq'::regclass);


--
-- Name: posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts ALTER COLUMN id SET DEFAULT nextval('public.posts_id_seq'::regclass);


--
-- Name: push_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.push_subscriptions_id_seq'::regclass);


--
-- Name: report_schedules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_schedules ALTER COLUMN id SET DEFAULT nextval('public.report_schedules_id_seq'::regclass);


--
-- Name: saved_texts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_texts ALTER COLUMN id SET DEFAULT nextval('public.saved_texts_id_seq'::regclass);


--
-- Name: smartlink_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smartlink_items ALTER COLUMN id SET DEFAULT nextval('public.smartlink_items_id_seq'::regclass);


--
-- Name: smartlinks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smartlinks ALTER COLUMN id SET DEFAULT nextval('public.smartlinks_id_seq'::regclass);


--
-- Name: subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions ALTER COLUMN id SET DEFAULT nextval('public.subscriptions_id_seq'::regclass);


--
-- Name: tiktok_stats_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiktok_stats_history ALTER COLUMN id SET DEFAULT nextval('public.tiktok_stats_history_id_seq'::regclass);


--
-- Name: tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens ALTER COLUMN id SET DEFAULT nextval('public.tokens_id_seq'::regclass);


--
-- Name: user_ai_keys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_keys ALTER COLUMN id SET DEFAULT nextval('public.user_ai_keys_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: webhook_endpoints id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_endpoints ALTER COLUMN id SET DEFAULT nextval('public.webhook_endpoints_id_seq'::regclass);


--
-- Name: workspaces id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces ALTER COLUMN id SET DEFAULT nextval('public.workspaces_id_seq'::regclass);


--
-- Name: youtube_stats_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_stats_history ALTER COLUMN id SET DEFAULT nextval('public.youtube_stats_history_id_seq'::regclass);


--
-- Name: zernio_webhook_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zernio_webhook_events ALTER COLUMN id SET DEFAULT nextval('public.zernio_webhook_events_id_seq'::regclass);


--
-- Name: ai_activity_log ai_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_activity_log
    ADD CONSTRAINT ai_activity_log_pkey PRIMARY KEY (id);


--
-- Name: ai_agent_approvals ai_agent_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_approvals
    ADD CONSTRAINT ai_agent_approvals_pkey PRIMARY KEY (nonce);


--
-- Name: ai_chat_messages ai_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_chat_messages
    ADD CONSTRAINT ai_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: ai_demo_usage ai_demo_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_demo_usage
    ADD CONSTRAINT ai_demo_usage_pkey PRIMARY KEY (user_id, dia);


--
-- Name: ai_image_leads ai_image_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_image_leads
    ADD CONSTRAINT ai_image_leads_pkey PRIMARY KEY (id);


--
-- Name: ai_image_usage ai_image_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_image_usage
    ADD CONSTRAINT ai_image_usage_pkey PRIMARY KEY (user_id, usage_month);


--
-- Name: ai_memory ai_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_memory
    ADD CONSTRAINT ai_memory_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: app_events app_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_events
    ADD CONSTRAINT app_events_pkey PRIMARY KEY (id);


--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);


--
-- Name: billing_plan_changes billing_plan_changes_gateway_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_plan_changes
    ADD CONSTRAINT billing_plan_changes_gateway_session_id_key UNIQUE (gateway_session_id);


--
-- Name: billing_plan_changes billing_plan_changes_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_plan_changes
    ADD CONSTRAINT billing_plan_changes_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: billing_plan_changes billing_plan_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_plan_changes
    ADD CONSTRAINT billing_plan_changes_pkey PRIMARY KEY (id);


--
-- Name: billing_plan_changes billing_plan_changes_user_id_billing_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_plan_changes
    ADD CONSTRAINT billing_plan_changes_user_id_billing_month_key UNIQUE (user_id, billing_month);


--
-- Name: contas contas_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_v2_pkey PRIMARY KEY (id);


--
-- Name: contas contas_v2_user_id_platform_handle_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_v2_user_id_platform_handle_key UNIQUE (user_id, platform, handle);


--
-- Name: content_queues content_queues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_queues
    ADD CONSTRAINT content_queues_pkey PRIMARY KEY (id);


--
-- Name: credentials credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credentials
    ADD CONSTRAINT credentials_pkey PRIMARY KEY (id);


--
-- Name: credentials credentials_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credentials
    ADD CONSTRAINT credentials_user_id_key UNIQUE (user_id);


--
-- Name: drafts drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drafts
    ADD CONSTRAINT drafts_pkey PRIMARY KEY (id);


--
-- Name: inbox_seen_comments inbox_seen_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_seen_comments
    ADD CONSTRAINT inbox_seen_comments_pkey PRIMARY KEY (user_id, post_id);


--
-- Name: instagram_followers_history instagram_followers_history_conta_id_captured_on_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_followers_history
    ADD CONSTRAINT instagram_followers_history_conta_id_captured_on_key UNIQUE (conta_id, captured_on);


--
-- Name: instagram_followers_history instagram_followers_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_followers_history
    ADD CONSTRAINT instagram_followers_history_pkey PRIMARY KEY (id);


--
-- Name: logs logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT logs_pkey PRIMARY KEY (id);


--
-- Name: media_assets media_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);


--
-- Name: media_folders media_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_folders
    ADD CONSTRAINT media_folders_pkey PRIMARY KEY (id);


--
-- Name: oauth_flow_states oauth_flow_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_flow_states
    ADD CONSTRAINT oauth_flow_states_pkey PRIMARY KEY (state_hash);


--
-- Name: oauth_pkce_state oauth_pkce_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_pkce_state
    ADD CONSTRAINT oauth_pkce_state_pkey PRIMARY KEY (state);


--
-- Name: platform_health platform_health_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_health
    ADD CONSTRAINT platform_health_pkey PRIMARY KEY (platform);


--
-- Name: platform_presets platform_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_presets
    ADD CONSTRAINT platform_presets_pkey PRIMARY KEY (id);


--
-- Name: post_accounts post_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_accounts
    ADD CONSTRAINT post_accounts_pkey PRIMARY KEY (id);


--
-- Name: post_accounts post_accounts_post_id_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_accounts
    ADD CONSTRAINT post_accounts_post_id_account_id_key UNIQUE (post_id, account_id);


--
-- Name: post_first_comments post_first_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_first_comments
    ADD CONSTRAINT post_first_comments_pkey PRIMARY KEY (id);


--
-- Name: post_first_comments post_first_comments_post_publication_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_first_comments
    ADD CONSTRAINT post_first_comments_post_publication_id_key UNIQUE (post_publication_id);


--
-- Name: post_metrics_history post_metrics_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_metrics_history
    ADD CONSTRAINT post_metrics_history_pkey PRIMARY KEY (id);


--
-- Name: post_publications post_publications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_publications
    ADD CONSTRAINT post_publications_pkey PRIMARY KEY (id);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: rate_limit_counters rate_limit_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_counters
    ADD CONSTRAINT rate_limit_counters_pkey PRIMARY KEY (key);


--
-- Name: report_schedules report_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_schedules
    ADD CONSTRAINT report_schedules_pkey PRIMARY KEY (id);


--
-- Name: saved_texts saved_texts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_texts
    ADD CONSTRAINT saved_texts_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: smartlink_items smartlink_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smartlink_items
    ADD CONSTRAINT smartlink_items_pkey PRIMARY KEY (id);


--
-- Name: smartlink_slug_aliases smartlink_slug_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smartlink_slug_aliases
    ADD CONSTRAINT smartlink_slug_aliases_pkey PRIMARY KEY (slug);


--
-- Name: smartlinks smartlinks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smartlinks
    ADD CONSTRAINT smartlinks_pkey PRIMARY KEY (id);


--
-- Name: smartlinks smartlinks_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smartlinks
    ADD CONSTRAINT smartlinks_slug_key UNIQUE (slug);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_stripe_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);


--
-- Name: tiktok_stats_history tiktok_stats_history_conta_id_captured_on_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiktok_stats_history
    ADD CONSTRAINT tiktok_stats_history_conta_id_captured_on_key UNIQUE (conta_id, captured_on);


--
-- Name: tiktok_stats_history tiktok_stats_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiktok_stats_history
    ADD CONSTRAINT tiktok_stats_history_pkey PRIMARY KEY (id);


--
-- Name: tokens tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens
    ADD CONSTRAINT tokens_pkey PRIMARY KEY (id);


--
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (user_id, marco);


--
-- Name: user_ai_keys user_ai_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_keys
    ADD CONSTRAINT user_ai_keys_pkey PRIMARY KEY (id);


--
-- Name: user_ai_keys user_ai_keys_user_id_modelo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_keys
    ADD CONSTRAINT user_ai_keys_user_id_modelo_key UNIQUE (user_id, modelo);


--
-- Name: user_ai_prefs user_ai_prefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_prefs
    ADD CONSTRAINT user_ai_prefs_pkey PRIMARY KEY (user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_google_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_google_id_key UNIQUE (google_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_stripe_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_stripe_customer_id_key UNIQUE (stripe_customer_id);


--
-- Name: webhook_endpoints webhook_endpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_pkey PRIMARY KEY (id);


--
-- Name: workspace_members workspace_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (workspace_id, user_id);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: workspaces workspaces_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_slug_key UNIQUE (slug);


--
-- Name: youtube_stats_history youtube_stats_history_conta_id_captured_on_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_stats_history
    ADD CONSTRAINT youtube_stats_history_conta_id_captured_on_key UNIQUE (conta_id, captured_on);


--
-- Name: youtube_stats_history youtube_stats_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_stats_history
    ADD CONSTRAINT youtube_stats_history_pkey PRIMARY KEY (id);


--
-- Name: zernio_oauth_pending zernio_oauth_pending_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zernio_oauth_pending
    ADD CONSTRAINT zernio_oauth_pending_pkey PRIMARY KEY (id);


--
-- Name: zernio_webhook_events zernio_webhook_events_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zernio_webhook_events
    ADD CONSTRAINT zernio_webhook_events_event_id_key UNIQUE (event_id);


--
-- Name: zernio_webhook_events zernio_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zernio_webhook_events
    ADD CONSTRAINT zernio_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: idx_ai_agent_approvals_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agent_approvals_expiry ON public.ai_agent_approvals USING btree (expires_at);


--
-- Name: idx_ai_chat_messages_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_chat_messages_user ON public.ai_chat_messages USING btree (user_id, criado_em DESC);


--
-- Name: idx_api_keys_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_active ON public.api_keys USING btree (key_hash) WHERE (revoked_at IS NULL);


--
-- Name: idx_app_events_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_events_id ON public.app_events USING btree (id);


--
-- Name: idx_approval_requests_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_requests_workspace ON public.approval_requests USING btree (workspace_id, status, criado_em DESC);


--
-- Name: idx_billing_plan_changes_gateway_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_plan_changes_gateway_session ON public.billing_plan_changes USING btree (gateway_session_id) WHERE (gateway_session_id IS NOT NULL);


--
-- Name: idx_billing_plan_changes_meu_ecoo_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_plan_changes_meu_ecoo_email ON public.billing_plan_changes USING btree (meu_ecoo_email_status) WHERE (to_plan = ANY (ARRAY['pro'::text, 'premium'::text]));


--
-- Name: idx_billing_plan_changes_user_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_plan_changes_user_month ON public.billing_plan_changes USING btree (user_id, billing_month DESC);


--
-- Name: idx_contas_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contas_platform ON public.contas USING btree (platform);


--
-- Name: idx_contas_platform_external_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contas_platform_external_user_id ON public.contas USING btree (platform, external_user_id);


--
-- Name: idx_contas_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contas_user_id ON public.contas USING btree (user_id);


--
-- Name: idx_contas_zernio_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contas_zernio_profile_id ON public.contas USING btree (zernio_profile_id) WHERE (zernio_profile_id IS NOT NULL);


--
-- Name: idx_content_queues_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_queues_due ON public.content_queues USING btree (active, next_run_at);


--
-- Name: idx_credentials_reset_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credentials_reset_token ON public.credentials USING btree (reset_token) WHERE (reset_token IS NOT NULL);


--
-- Name: idx_credentials_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credentials_user_id ON public.credentials USING btree (user_id);


--
-- Name: idx_instagram_followers_history_conta_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instagram_followers_history_conta_id ON public.instagram_followers_history USING btree (conta_id);


--
-- Name: idx_logs_criado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_criado ON public.logs USING btree (criado_em DESC);


--
-- Name: idx_logs_criado_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_criado_em ON public.logs USING btree (criado_em);


--
-- Name: idx_logs_notification_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_logs_notification_key ON public.logs USING btree (notification_key) WHERE (notification_key IS NOT NULL);


--
-- Name: idx_logs_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_platform ON public.logs USING btree (platform);


--
-- Name: idx_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_user_id ON public.logs USING btree (user_id);


--
-- Name: idx_media_assets_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_assets_user_created ON public.media_assets USING btree (user_id, criado_em DESC);


--
-- Name: idx_media_folders_user_name_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_media_folders_user_name_lower ON public.media_folders USING btree (user_id, lower(name));


--
-- Name: idx_oauth_flow_states_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_flow_states_expiry ON public.oauth_flow_states USING btree (expires_at);


--
-- Name: idx_post_accounts_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_accounts_pending ON public.post_accounts USING btree (id) WHERE (instagram_pending IS NOT NULL);


--
-- Name: idx_post_accounts_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_accounts_post_id ON public.post_accounts USING btree (post_id);


--
-- Name: idx_post_accounts_provider_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_post_accounts_provider_request_id ON public.post_accounts USING btree (provider_request_id) WHERE (provider_request_id IS NOT NULL);


--
-- Name: idx_post_metrics_history_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_metrics_history_post_id ON public.post_metrics_history USING btree (post_id);


--
-- Name: idx_post_publications_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_publications_post_id ON public.post_publications USING btree (post_id);


--
-- Name: idx_posts_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_account_id ON public.posts USING btree (account_id);


--
-- Name: idx_posts_instagram_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_instagram_pending ON public.posts USING btree (((instagram_pending IS NOT NULL))) WHERE (instagram_pending IS NOT NULL);


--
-- Name: idx_posts_media_cleanup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_media_cleanup ON public.posts USING btree (media_cleanup_after) WHERE ((media_cleanup_after IS NOT NULL) AND (media_cleaned_at IS NULL));


--
-- Name: idx_posts_platforms_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_platforms_gin ON public.posts USING gin (platforms);


--
-- Name: idx_posts_published_no_external; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_published_no_external ON public.posts USING btree (status, criado_em DESC) WHERE (((status)::text = 'published'::text) AND (external_post_id IS NULL));


--
-- Name: idx_posts_sched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_sched ON public.posts USING btree (scheduled_at);


--
-- Name: idx_posts_scheduled_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_scheduled_at ON public.posts USING btree (scheduled_at);


--
-- Name: idx_posts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_status ON public.posts USING btree (status);


--
-- Name: idx_posts_status_sched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_status_sched ON public.posts USING btree (status, scheduled_at);


--
-- Name: idx_posts_status_scheduled_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_status_scheduled_at ON public.posts USING btree (scheduled_at) WHERE ((status)::text = 'scheduled'::text);


--
-- Name: idx_posts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_user_id ON public.posts USING btree (user_id);


--
-- Name: idx_rate_limit_counters_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limit_counters_expiry ON public.rate_limit_counters USING btree (expires_at);


--
-- Name: idx_report_schedules_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_schedules_due ON public.report_schedules USING btree (active, next_run_at);


--
-- Name: idx_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_expire ON public.session USING btree (expire);


--
-- Name: idx_smartlink_slug_aliases_smartlink; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_smartlink_slug_aliases_smartlink ON public.smartlink_slug_aliases USING btree (smartlink_id);


--
-- Name: idx_smartlinks_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_smartlinks_slug ON public.smartlinks USING btree (slug);


--
-- Name: idx_subscriptions_stripe_subscription_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_stripe_subscription_id ON public.subscriptions USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL);


--
-- Name: idx_subscriptions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);


--
-- Name: idx_tiktok_stats_history_conta_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tiktok_stats_history_conta_id ON public.tiktok_stats_history USING btree (conta_id);


--
-- Name: idx_tokens_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tokens_conta ON public.tokens USING btree (conta_id);


--
-- Name: idx_tokens_conta_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tokens_conta_id ON public.tokens USING btree (conta_id);


--
-- Name: idx_tokens_conta_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tokens_conta_platform ON public.tokens USING btree (conta_id, platform);


--
-- Name: idx_tokens_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tokens_platform ON public.tokens USING btree (platform);


--
-- Name: idx_tokens_platform_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tokens_platform_status ON public.tokens USING btree (platform, status);


--
-- Name: idx_tokens_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tokens_status ON public.tokens USING btree (status);


--
-- Name: idx_users_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_plan ON public.users USING btree (plan);


--
-- Name: idx_users_plan_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_plan_active ON public.users USING btree (plan_active);


--
-- Name: idx_users_plan_unrestricted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_plan_unrestricted ON public.users USING btree (plan_unrestricted);


--
-- Name: idx_users_stripe_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_stripe_customer_id ON public.users USING btree (stripe_customer_id) WHERE (stripe_customer_id IS NOT NULL);


--
-- Name: idx_users_zernio_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_zernio_profile_id ON public.users USING btree (zernio_profile_id) WHERE (zernio_profile_id IS NOT NULL);


--
-- Name: idx_webhook_endpoints_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_endpoints_user ON public.webhook_endpoints USING btree (user_id, active);


--
-- Name: idx_youtube_stats_history_conta_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_youtube_stats_history_conta_id ON public.youtube_stats_history USING btree (conta_id);


--
-- Name: idx_zernio_oauth_pending_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zernio_oauth_pending_created ON public.zernio_oauth_pending USING btree (criado_em);


--
-- Name: idx_zernio_webhook_events_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zernio_webhook_events_pending ON public.zernio_webhook_events USING btree (next_attempt_at, received_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: post_metrics_history_post_platform_day; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX post_metrics_history_post_platform_day ON public.post_metrics_history USING btree (post_id, platform, captured_on);


--
-- Name: post_publications_post_platform_account; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX post_publications_post_platform_account ON public.post_publications USING btree (post_id, platform, account_id) WHERE (account_id IS NOT NULL);


--
-- Name: post_publications_post_platform_external_null_account; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX post_publications_post_platform_external_null_account ON public.post_publications USING btree (post_id, platform, external_post_id) WHERE ((account_id IS NULL) AND (external_post_id IS NOT NULL));


--
-- Name: ai_agent_approvals ai_agent_approvals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_approvals
    ADD CONSTRAINT ai_agent_approvals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ai_image_usage ai_image_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_image_usage
    ADD CONSTRAINT ai_image_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ai_memory ai_memory_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_memory
    ADD CONSTRAINT ai_memory_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: api_keys api_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: app_events app_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_events
    ADD CONSTRAINT app_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: approval_requests approval_requests_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: approval_requests approval_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: approval_requests approval_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: approval_requests approval_requests_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: billing_plan_changes billing_plan_changes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_plan_changes
    ADD CONSTRAINT billing_plan_changes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: contas contas_v2_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_v2_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: content_queues content_queues_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_queues
    ADD CONSTRAINT content_queues_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: credentials credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credentials
    ADD CONSTRAINT credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: drafts drafts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drafts
    ADD CONSTRAINT drafts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: inbox_seen_comments inbox_seen_comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_seen_comments
    ADD CONSTRAINT inbox_seen_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: inbox_seen_comments inbox_seen_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_seen_comments
    ADD CONSTRAINT inbox_seen_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: instagram_followers_history instagram_followers_history_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_followers_history
    ADD CONSTRAINT instagram_followers_history_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: logs logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: media_assets media_assets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: media_folders media_folders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_folders
    ADD CONSTRAINT media_folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: oauth_flow_states oauth_flow_states_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_flow_states
    ADD CONSTRAINT oauth_flow_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: platform_presets platform_presets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_presets
    ADD CONSTRAINT platform_presets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: post_accounts post_accounts_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_accounts
    ADD CONSTRAINT post_accounts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: post_accounts post_accounts_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_accounts
    ADD CONSTRAINT post_accounts_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_first_comments post_first_comments_post_publication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_first_comments
    ADD CONSTRAINT post_first_comments_post_publication_id_fkey FOREIGN KEY (post_publication_id) REFERENCES public.post_publications(id) ON DELETE CASCADE;


--
-- Name: post_metrics_history post_metrics_history_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_metrics_history
    ADD CONSTRAINT post_metrics_history_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_publications post_publications_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_publications
    ADD CONSTRAINT post_publications_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.contas(id) ON DELETE SET NULL;


--
-- Name: post_publications post_publications_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_publications
    ADD CONSTRAINT post_publications_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: posts posts_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.contas(id) ON DELETE SET NULL;


--
-- Name: posts posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: report_schedules report_schedules_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_schedules
    ADD CONSTRAINT report_schedules_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: saved_texts saved_texts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_texts
    ADD CONSTRAINT saved_texts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: smartlink_items smartlink_items_smartlink_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smartlink_items
    ADD CONSTRAINT smartlink_items_smartlink_id_fkey FOREIGN KEY (smartlink_id) REFERENCES public.smartlinks(id) ON DELETE CASCADE;


--
-- Name: smartlink_slug_aliases smartlink_slug_aliases_smartlink_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smartlink_slug_aliases
    ADD CONSTRAINT smartlink_slug_aliases_smartlink_id_fkey FOREIGN KEY (smartlink_id) REFERENCES public.smartlinks(id) ON DELETE CASCADE;


--
-- Name: smartlinks smartlinks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smartlinks
    ADD CONSTRAINT smartlinks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tiktok_stats_history tiktok_stats_history_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tiktok_stats_history
    ADD CONSTRAINT tiktok_stats_history_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: tokens tokens_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens
    ADD CONSTRAINT tokens_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: webhook_endpoints webhook_endpoints_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspaces workspaces_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: youtube_stats_history youtube_stats_history_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_stats_history
    ADD CONSTRAINT youtube_stats_history_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON DELETE CASCADE;


--
-- Name: zernio_oauth_pending zernio_oauth_pending_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zernio_oauth_pending
    ADD CONSTRAINT zernio_oauth_pending_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


