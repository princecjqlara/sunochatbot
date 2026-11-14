import { describe, expect, it } from 'vitest';
import { isSunoSongConfig, normalizeSongBrief, normalizeSunoDetails, songBriefProgress, sunoAssignmentProgress, SUNO_DETAIL_FIELDS } from '../suno-business';
import { getChatbotDetailProgress } from '../chatbot-form-progress';
import { isCommercialVideoIntake } from '../chatbot-policy';
import { normalizeSalesDetails, songSalesSettings, usesSalesAssistant } from '../chatbot-sales-assistant';
import {normalizeCommercialVideoIntakeConfig} from '../chatbot-intake';

describe('Suno brief compatibility', () => {
    const song = { instructions: 'SONG_BRIEF_FORM: hiraya-seven-fields', commercial_video_intake_enabled: true, sales_assistant_settings: { pricing_enabled: true } };
    it('keeps a saved song configuration out of the video intake and package renderer', () => {
        expect(isSunoSongConfig(song)).toBe(true);
        expect(isCommercialVideoIntake(song)).toBe(false);
        expect(usesSalesAssistant(song)).toBe(false);
    });
    it('recognizes existing canonical song fields without requiring rewritten instructions', () => {
        expect(isSunoSongConfig({ details_to_collect: ['Business name', 'Lyrics language', 'Vocal preference'] })).toBe(true);
    });
    it('requires two distinct music fields to infer a song configuration',()=>{
        expect(isSunoSongConfig({details_to_collect:['Genre','Music genre']})).toBe(false);
    });
    it('uses canonical values before conflicting aliases, independent of input order',()=>{
        const a={'Business name':'Correct bakery','Business Name':'Old name',Genre:'Old genre','Preferred mood/style':'Jazz'};
        const expected={'Business name':'Correct bakery','Preferred mood/style':'Jazz'};
        expect(normalizeSunoDetails(a)).toEqual(expected);
        expect(normalizeSunoDetails(Object.fromEntries(Object.entries(a).reverse()))).toEqual(expected);
    });
    it.each(['asked','not stated','not sure','not yet specified','unknown!','???','to be determined'])('does not count the placeholder %s as a real answer',value=>{
        expect(normalizeSunoDetails({'Business name':value})).toEqual({});
    });
    it('counts distinct meaningful song answers while ignoring placeholders and video fields', () => {
        const progress = songBriefProgress({ 'Business Name': 'Example Bakery', 'Specialty/Products': 'Bread', Genre: 'Pop',
            'English or Tagalog lyrics': 'English or Tagalog lyrics', 'Male or Female singer': 'Male or Female singer',
            'Preferred Video Length': '24 seconds', 'Additional requests': 'Please mention our address' });
        expect(progress.fields).toEqual(['Business name', 'Main products or services', 'Preferred mood/style']);
        expect(progress.eligible).toBe(true);
        expect(progress.detail_count).toBe(3);
    });
    it('does not count aliases as extra answers or erase a valid field with a blank answer', () => {
        expect(songBriefProgress({ 'Business Name': 'Bakery', 'Company name': 'Bakery', Genre: '___' }).detail_count).toBe(1);
        expect(normalizeSongBrief({ Genre: 'Pop', 'Preferred mood/style': '' })).toEqual({ 'Preferred mood/style': 'Pop' });
    });
    it('presents and retains song fields in the optional customer form', () => {
        const settings = songSalesSettings(song);
        expect(settings.fields).toHaveLength(7);
        expect(normalizeSalesDetails({ 'English or Tagalog lyrics': 'Tagalog', Genre: 'Jazz', 'Male or Female singer': 'Female' }, settings))
            .toEqual({ 'Lyrics language': 'Tagalog', 'Preferred mood/style': 'Jazz', 'Vocal preference': 'Female' });
        expect(settings.fields.some(f => /video/i.test(f.label))).toBe(false);
    });
    it('retains the actual twenty-field profile and its saved 26 percent handoff gate', () => {
        const config = { ...song, details_to_collect: SUNO_DETAIL_FIELDS, details_completion_percent: 26 };
        expect(normalizeCommercialVideoIntakeConfig(config)).toMatchObject({commercial_video_intake_enabled:false,details_to_collect:SUNO_DETAIL_FIELDS,details_completion_percent:26});
        const details = { 'Business Name': 'Bakery', 'Specialty/Products': 'Bread', Genre: 'Jazz', 'Lyrics language': 'Tagalog',
            'Song duration': '60 seconds', 'Deadline or occasion date': 'November 20' };
        expect(sunoAssignmentProgress(config, details)).toMatchObject({detail_count:6,required:6,total:20,eligible:true});
        expect(sunoAssignmentProgress(config, {...details,'Song duration':''}).eligible).toBe(false);
        expect(getChatbotDetailProgress(config, details)).toMatchObject({saved_count:6,required_count:20,complete:false,
            collected_details:{'Song duration':'60 seconds','Deadline or occasion date':'November 20'}});
    });
});
