import { describe, expect, it } from 'vitest';
import {
    classifyMessengerSystemMessage,
    findLatestMessengerAutomationStop,
    findMessengerLabelAutomationStop,
    findLatestMessengerLeadStageEvent,
    findLatestMessengerSystemSignal
} from './messaging-auto-tag';

describe('classifyMessengerSystemMessage', () => {
    it('accepts qualified, not-qualified, and converted stage records', () => {
        expect(classifyMessengerSystemMessage('Lead stage set to Qualified')).toBe('qualified');
        expect(classifyMessengerSystemMessage('Lead stage set to Not Qualified')).toBe('not_qualified');
        expect(classifyMessengerSystemMessage('Lead stage set to Disqualified.')).toBe('not_qualified');
        expect(classifyMessengerSystemMessage('Lead stage set to Converted')).toBe('converted');
        expect(classifyMessengerSystemMessage('Lead stage set to Order Created')).toBe('order_created');
    });

    it('accepts explicit created and requested order notifications', () => {
        expect(classifyMessengerSystemMessage('You created an order for PHP699. View: fb-pma://payments/orderdetails/?invoice_id=12345')).toBe('order_created');
        expect(classifyMessengerSystemMessage('You requested PHP699. View: fb-pma://payments/orderdetails/?invoice_id=12345')).toBe('order_created');
    });

    it('does not mistake payment claims or ordinary text for a qualifying event', () => {
        expect(classifyMessengerSystemMessage('I paid PHP699')).toBeNull();
        expect(classifyMessengerSystemMessage('You created an order for PHP699')).toBeNull();
    });

    it('finds the newest Lead Center stage written by the Page', () => {
        expect(findLatestMessengerSystemSignal([
            {
                message: 'Lead stage set to Qualified',
                from: { id: 'page-1' },
                created_time: '2026-09-25T10:00:00Z'
            },
            {
                message: 'Lead stage set to Converted',
                from: { id: 'page-1' },
                created_time: '2026-09-26T10:00:00Z'
            }
        ], 'page-1')).toBe('converted');
    });

    it('ignores stage-like text sent by a customer', () => {
        expect(findLatestMessengerSystemSignal([{
            message: 'Lead stage set to Qualified',
            from: { id: 'customer-1' },
            created_time: '2026-09-26T10:00:00Z'
        }], 'page-1')).toBeNull();
    });

    it('returns audit metadata for the newest explicit lead-stage change', () => {
        expect(findLatestMessengerLeadStageEvent([
            {
                id: 'stage-old',
                message: 'Lead stage set to Qualified',
                from: { id: 'page-1' },
                created_time: '2026-09-28T10:00:00Z'
            },
            {
                id: 'stage-new',
                message: 'Lead stage set to Converted',
                from: { id: 'page-1' },
                created_time: '2026-09-29T10:00:00Z'
            },
            {
                id: 'order-event',
                message: 'You created an order for PHP699. View: fb-pma://payments/orderdetails/?invoice_id=12345',
                from: { id: 'page-1' },
                created_time: '2026-09-29T11:00:00Z'
            }
        ], 'page-1')).toEqual({
            messageId: 'stage-new',
            signal: 'converted',
            createdTime: '2026-09-29T10:00:00Z'
        });
    });
});

describe('current inbox stage labels', () => {
    it.each([
        ['Qualified', 'qualified'], ['Not qualified', 'not_qualified'], ['Disqualified', 'not_qualified'],
        ['Converted', 'converted'], ['Paid', 'converted'], ['Order placed', 'order_created'],
        ['Dispatched', 'order_created'], ['Quote requested', 'manual'], ['Custom stage', 'manual']
    ])('blocks the %s label even without a stage history event', (name, expected) => {
        expect(findMessengerLabelAutomationStop([{ page_label_name: name }])).toBe(expected);
    });
    it('allows Intake and ignores the observed automatic ad-attribution labels', () => {
        expect(findMessengerLabelAutomationStop(['Intake', 'ad_id.123', 'messenger_ads', 'Ad response']
            .map(page_label_name => ({ page_label_name })))).toBeNull();
    });
    it('a Qualified label overrides a simultaneous Intake label', () => {
        expect(findMessengerLabelAutomationStop(['Intake', 'Qualified'].map(page_label_name => ({ page_label_name })))).toBe('qualified');
    });
});

describe('Intake-only Messenger automation', () => {
    const stage = (name: string, created_time = '2026-10-17T10:00:00Z', from = 'page') => ({
        message: `Lead stage set to ${name}`, created_time, from: { id: from }
    });
    it.each(['Intake', 'intake', 'Intake.'])('allows the Intake stage: %s', name => {
        expect(findLatestMessengerAutomationStop([stage(name)], 'page')).toBeNull();
    });
    it.each(['Contacted', 'Interested', 'In Progress', 'Follow Up', 'Won', 'Lost', 'New custom stage'])('stops for any other stage: %s', name => {
        expect(findLatestMessengerAutomationStop([stage(name)], 'page')).toBe('manual');
    });
    it('uses the newest assignment rather than an older stage or API array order', () => {
        const old = stage('Qualified', '2026-10-16T10:00:00Z'), intake = stage('Intake');
        expect(findLatestMessengerAutomationStop([old, intake], 'page')).toBeNull();
        expect(findLatestMessengerAutomationStop([intake, stage('Interested', '2026-10-17T11:00:00Z')], 'page')).toBe('manual');
    });
    it('ignores customer claims and ordinary staff prose', () => {
        expect(findLatestMessengerAutomationStop([stage('Qualified', undefined, 'customer'),
            { message: 'Please change Lead stage set to Qualified later', from: { id: 'page' } }], 'page')).toBeNull();
    });
    it('keeps actual orders closed even when the latest stage is Intake', () => {
        expect(findLatestMessengerAutomationStop([stage('Intake'), {
            from: { id: 'page' }, message: 'You created an order for PHP699. View: fb-pma://payments/orderdetails/?invoice_id=12345'
        }], 'page')).toBe('order_created');
    });
});
