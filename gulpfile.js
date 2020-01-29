(function() {
    'use strict';

    var gulp = require('gulp');
    var angularTranslate = require('./');

    function extractTranslations() {
        return gulp.src('fixtures/fixture1.html')
            .pipe(angularTranslate({
                lang: ['fr_FR', 'en_CA'],
                // suffix: '.json'
                // prefix: 'project_'
                // defaultLang: 'en_CA'
                // interpolation: {
                //     startDelimiter: '[[',
                //     endDelimiter: ']]'
                // }
                // namespace: true,
                // stringifyOptions: true,
                // nullEmpty: true
                // contentAsValue: true,
                dest: './dest/i18nextract/'
            }))
            .pipe(gulp.dest('./'));
    }

    gulp.task('default', extractTranslations);

})();
