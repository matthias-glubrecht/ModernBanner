'use strict';
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  moduleNameMapper: {
    '\\.module\\.scss$': '<rootDir>/tests/styleMock.js',
    '^LaufschriftApplicationCustomizerStrings$': '<rootDir>/tests/stringsMock.js'
  },
  collectCoverageFrom: ['lib/extensions/laufschrift/*.js'],
  coverageDirectory: 'coverage'
};
